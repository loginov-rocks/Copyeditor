import {
  type ButtonComponent, ItemView, MarkdownRenderer, normalizePath, Notice, Setting, TFile, type WorkspaceLeaf,
} from 'obsidian';

import type { CopyeditorPlugin } from '../CopyeditorPlugin';

import { Client, type PromptOptions } from '../services/Client';
import { Copyeditor, type StyleCardResult } from '../services/Copyeditor';
import { FileSuggest } from './FileSuggest';
import { PromptOptionsPanel } from './PromptOptionsPanel';

export const VIEW_TYPE_STYLE_CARD = 'copyeditor-style-card-view';

/**
 * Workspace pane for configuring and running the style card generator: picks a prompt file and
 * reference files, wires up prompt options and frontmatter toggles, then hands off to Copyeditor.
 */
export class StyleCardView extends ItemView {
  private generateButtonComponent: ButtonComponent | null = null;
  private includeEstimatedCost = true;
  private includePromptOptions = true;
  private includeReferences = true;
  private isGenerating = false;
  private isRendering = false;
  private readonly plugin: CopyeditorPlugin;
  private promptOptions: PromptOptions = { maxTokens: 0, model: '' };
  private promptPath = '';
  private readonly referenceFiles = new Set<TFile>();
  private resultEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CopyeditorPlugin) {
    super(leaf);

    this.plugin = plugin;
  }

  public getDisplayText(): string {
    return 'Style Card Generator';
  }

  public getViewType(): string {
    return VIEW_TYPE_STYLE_CARD;
  }

  public async render(): Promise<void> {
    if (this.isRendering) {
      return;
    }

    this.isRendering = true;

    try {
      await this.renderForm();
    } finally {
      this.isRendering = false;
    }
  }

  protected async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  protected async onOpen(): Promise<void> {
    await this.render();
  }

  private async handleGenerate(): Promise<void> {
    if (this.isGenerating) {
      return;
    }

    const apiKey = this.plugin.getApiKey();

    if (!apiKey) {
      new Notice('Set your API key in Copyeditor settings first');

      return;
    }

    const promptFile = this.app.vault.getAbstractFileByPath(this.promptPath);

    if (!(promptFile instanceof TFile)) {
      new Notice('Pick a prompt file first');

      return;
    }

    if (this.referenceFiles.size === 0) {
      new Notice('Pick at least one reference file');

      return;
    }

    this.isGenerating = true;
    this.generateButtonComponent?.setDisabled(true);
    new Notice('Generating style card...');

    let outputFile: null | TFile = null;
    let result: null | StyleCardResult = null;

    try {
      const prompt = await this.app.vault.cachedRead(promptFile);
      const references = await Promise.all(
        [...this.referenceFiles].map(async file => ({
          content: await this.app.vault.cachedRead(file),
          path: file.path,
        })),
      );

      const copyeditor = new Copyeditor({ client: new Client({ apiKey }) });

      result = await copyeditor.generateStyleCard({
        includeEstimatedCost: this.includeEstimatedCost,
        includePromptOptions: this.includePromptOptions,
        includeReferences: this.includeReferences,
        promptOptions: this.promptOptions,
        references,
        userPrompt: prompt,
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = normalizePath(`Style Card ${timestamp}.md`);

      outputFile = await this.app.vault.create(outputPath, result.content);
      new Notice(`Style card saved to ${outputPath}`);
    } catch (error) {
      new Notice(`Failed to generate style card: ${(error as Error).message}!`);
    } finally {
      this.isGenerating = false;
      this.generateButtonComponent?.setDisabled(false);
    }

    if (result && outputFile) {
      try {
        await this.renderResult(result, outputFile);
      } catch (error) {
        console.error('[Copyeditor] Failed to render style card result', error);
      }
    }
  }

  private async renderForm(): Promise<void> {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h2', { text: 'Style Card Generator' });

    const markdownFiles = this.app.vault.getMarkdownFiles();

    this.referenceFiles.clear();
    this.promptPath = markdownFiles[0]?.path ?? '';

    new Setting(contentEl)
      .setName('Prompt File')
      .setDesc('File containing the prompt template with a <references /> tag')
      .addText((text) => {
        text.setPlaceholder('Search for a File...').setValue(this.promptPath).onChange((value) => {
          this.promptPath = value;
        });

        const suggest = new FileSuggest(
          this.app,
          text.inputEl,
          () => markdownFiles.filter(file => !this.referenceFiles.has(file)),
        );

        suggest.onSelect((file) => {
          this.promptPath = file.path;
          text.setValue(file.path);
          suggest.close();
        });
      });

    contentEl.createEl('h3', { text: 'Reference Files' });

    const referenceListEl = contentEl.createDiv();

    new Setting(contentEl)
      .setName('Add Reference File')
      .addText((text) => {
        const suggest = new FileSuggest(
          this.app,
          text.inputEl,
          () => markdownFiles.filter(file => file.path !== this.promptPath && !this.referenceFiles.has(file)),
        );

        suggest.onSelect((file) => {
          this.referenceFiles.add(file);
          text.setValue('');
          this.renderReferenceList(referenceListEl);
          suggest.close();
        });
      });

    this.renderReferenceList(referenceListEl);

    contentEl.createEl('h3', { text: 'Prompt Options' });

    this.promptOptions = { ...this.plugin.settings.defaultPromptOptions };

    await new PromptOptionsPanel({
      apiKey: this.plugin.getApiKey() ?? '',
      containerEl: contentEl,
      defaults: this.promptOptions,
      onChange: (value): void => {
        this.promptOptions = value;
      },
    }).render();

    contentEl.createEl('h3', { text: 'Includes' });

    this.includeEstimatedCost = this.plugin.settings.styleCard.includeEstimatedCost;

    new Setting(contentEl)
      .setName('Include Estimated Cost')
      .setDesc('Include the estimated cost in Frontmatter')
      .addToggle(toggle => toggle.setValue(this.includeEstimatedCost).onChange((value) => {
        this.includeEstimatedCost = value;
      }));

    this.includePromptOptions = this.plugin.settings.styleCard.includePromptOptions;

    new Setting(contentEl)
      .setName('Include Prompt Options')
      .setDesc('Include the model, effort, thinking, and max tokens used in Frontmatter')
      .addToggle(toggle => toggle.setValue(this.includePromptOptions).onChange((value) => {
        this.includePromptOptions = value;
      }));

    this.includeReferences = this.plugin.settings.styleCard.includeReferences;

    new Setting(contentEl)
      .setName('Include References')
      .setDesc('Append a "## References" section with links to the reference files used')
      .addToggle(toggle => toggle.setValue(this.includeReferences).onChange((value) => {
        this.includeReferences = value;
      }));

    new Setting(contentEl)
      .addButton((button) => {
        this.generateButtonComponent = button;

        button.setButtonText('Generate Style Card')
          .setCta()
          .onClick(() => {
            void this.handleGenerate();
          });
      });

    this.resultEl = contentEl.createDiv();
  }

  private renderReferenceList(containerEl: HTMLElement): void {
    containerEl.empty();

    for (const file of this.referenceFiles) {
      new Setting(containerEl)
        .setName(file.path)
        .addButton(button => button.setButtonText('Remove').onClick(() => {
          this.referenceFiles.delete(file);
          this.renderReferenceList(containerEl);
        }));
    }
  }

  private async renderResult(result: StyleCardResult, outputFile: TFile): Promise<void> {
    const resultEl = this.resultEl;

    if (!resultEl) {
      return;
    }

    resultEl.empty();

    new Setting(resultEl)
      .setName('Style Card Saved')
      .setDesc(outputFile.path)
      .addButton(button => button.setButtonText('Open').onClick(() => {
        void this.app.workspace.getLeaf(false).openFile(outputFile);
      }));

    if (result.estimatedCost !== null) {
      resultEl.createEl('h3', { text: 'Usage' });
      resultEl.createEl('p', { text: `Cost: $${result.estimatedCost.toFixed(4)}` });
    }

    if (result.thinkingContent) {
      resultEl.createEl('h3', { text: 'Thinking' });

      const thinkingEl = resultEl.createDiv();

      await MarkdownRenderer.render(this.app, result.thinkingContent, thinkingEl, '', this);
    }
  }
}
