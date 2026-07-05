import type { App, Editor, MarkdownFileInfo, MarkdownView } from 'obsidian';

import {
  type ButtonComponent, ItemView, MarkdownRenderer, Notice, Setting, TFile, type WorkspaceLeaf,
} from 'obsidian';

import type { CopyeditorPlugin } from '../CopyeditorPlugin';

import { Client, type ModelEffort, type PromptOptions } from '../services/Client';
import { Copyeditor, type RevisionResult } from '../services/Copyeditor';
import { FileSuggest } from './FileSuggest';
import { PromptOptionsPanel } from './PromptOptionsPanel';

export const VIEW_TYPE_REVISION = 'copyeditor-revision-view';

export interface RevisionSelection {
  content: string;
  endOffset: number;
  path: string;
  promptOptions: Partial<PromptOptions>;
  revisionPromptPath: string;
  selection: string;
  startOffset: number;
  styleCardPath: string;
}

interface Bounds {
  end: number;
  start: number;
}

/**
 * Workspace pane showing a selection sent for revision: the source file path, the selected text,
 * its start/end offsets, optional surrounding-paragraph/section previews with the selection
 * wrapped in `<selection>` tags, and a style card file/revision prompt file/prompt options
 * preselected from the source file's `copyeditor_*` frontmatter, if set.
 */
export class RevisionView extends ItemView {
  private generateButtonComponent: ButtonComponent | null = null;
  private includeEstimatedCost: boolean;
  private includeFull = false;
  private includeParagraph = false;
  private includePromptOptions: boolean;
  private includeRevisionPromptPath: boolean;
  private includeSection = false;
  private includeStyleCardPath: boolean;
  private instructions = '';
  private isGenerating = false;
  private isRendering = false;
  private readonly plugin: CopyeditorPlugin;
  private promptOptions: PromptOptions;
  private promptPath: string;
  private resultEl: HTMLElement | null = null;
  private revisionSelection: null | RevisionSelection = null;
  private styleCardPath = '';

  constructor(leaf: WorkspaceLeaf, plugin: CopyeditorPlugin) {
    super(leaf);

    this.plugin = plugin;
    this.includeEstimatedCost = plugin.settings.revision.includeEstimatedCost;
    this.includePromptOptions = plugin.settings.revision.includePromptOptions;
    this.includeRevisionPromptPath = plugin.settings.revision.includeRevisionPromptPath;
    this.includeStyleCardPath = plugin.settings.revision.includeStyleCardPath;
    this.promptOptions = { ...plugin.settings.defaultPromptOptions };
    this.promptPath = this.app.vault.getMarkdownFiles()[0]?.path ?? '';
  }

  /**
   * Builds the payload for `setSelection()` from the current editor selection, prefilling the
   * style card path, revision prompt path, and prompt options from the source file's
   * `copyeditor_*` frontmatter. Returns null if there's no selection. Path-shaped frontmatter
   * values are only kept if they still resolve to a real file, so a reference to a since-renamed
   * or deleted file doesn't silently preselect a dead path.
   */
  public static buildSelection(
    app: App, editor: Editor, ctx: MarkdownFileInfo | MarkdownView,
  ): null | RevisionSelection {
    const selection = editor.getSelection();

    if (!selection) {
      return null;
    }

    const file = ctx.file;
    const frontmatter = file ? app.metadataCache.getFileCache(file)?.frontmatter : undefined;

    return {
      content: editor.getValue(),
      endOffset: editor.posToOffset(editor.getCursor('to')),
      path: file?.path ?? '',
      promptOptions: RevisionView.getFrontmatterPromptOptions(frontmatter),
      revisionPromptPath: RevisionView.resolveExistingPath(app, frontmatter?.copyeditor_revisionPromptPath),
      selection,
      startOffset: editor.posToOffset(editor.getCursor('from')),
      styleCardPath: RevisionView.resolveExistingPath(app, frontmatter?.copyeditor_styleCardPath),
    };
  }

  /**
   * Reads the `copyeditor_*` prompt option overrides out of frontmatter, so a note that was
   * produced by (or previously revised with) this plugin re-applies the same model/effort/
   * maxTokens/thinking the next time it's sent to Revision.
   */
  private static getFrontmatterPromptOptions(
    frontmatter: Record<string, unknown> | undefined,
  ): Partial<PromptOptions> {
    const promptOptions: Partial<PromptOptions> = {};
    const effort = frontmatter?.copyeditor_effort;

    if (typeof effort === 'string' && Client.MODEL_EFFORTS.includes(effort as ModelEffort)) {
      promptOptions.effort = effort as ModelEffort;
    }
    if (typeof frontmatter?.copyeditor_maxTokens === 'number') {
      promptOptions.maxTokens = frontmatter.copyeditor_maxTokens;
    }
    if (typeof frontmatter?.copyeditor_model === 'string') {
      promptOptions.model = frontmatter.copyeditor_model;
    }
    if (typeof frontmatter?.copyeditor_thinking === 'boolean') {
      promptOptions.thinking = frontmatter.copyeditor_thinking;
    }

    return promptOptions;
  }

  /**
   * Returns `path` as-is only if it still resolves to a file in the vault.
   */
  private static resolveExistingPath(app: App, path: unknown): string {
    if (typeof path !== 'string' || !path) {
      return '';
    }

    return app.vault.getAbstractFileByPath(path) instanceof TFile ? path : '';
  }

  public getDisplayText(): string {
    return 'Revision';
  }

  public getViewType(): string {
    return VIEW_TYPE_REVISION;
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

  public async setSelection(revisionSelection: RevisionSelection): Promise<void> {
    this.revisionSelection = revisionSelection;
    this.styleCardPath = revisionSelection.styleCardPath;
    this.promptPath = revisionSelection.revisionPromptPath || (this.app.vault.getMarkdownFiles()[0]?.path ?? '');
    this.promptOptions = { ...this.plugin.settings.defaultPromptOptions, ...revisionSelection.promptOptions };
    await this.render();
  }

  protected async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  protected async onOpen(): Promise<void> {
    await this.render();
  }

  /**
   * Computes the current scope (whichever of Include Paragraph/Section/Full is active) and wraps
   * the selection within it in `<selection>` tags. Returns null if none of those toggles are on.
   */
  private computeScope(revisionSelection: RevisionSelection): null | { bounds: Bounds; wrapped: string } {
    const { content, endOffset, startOffset } = revisionSelection;

    const bounds = this.includeFull
      ? { end: content.length, start: 0 }
      : this.includeSection
        ? this.getSectionBounds(content, startOffset)
        : this.includeParagraph
          ? this.getParagraphBounds(content, startOffset, endOffset)
          : null;

    if (!bounds) {
      return null;
    }

    return { bounds, wrapped: this.wrapRange(content, bounds, revisionSelection) };
  }

  /**
   * Finds the paragraph around the selection: the text between the nearest blank lines on either
   * side (or the start/end of the document).
   */
  private getParagraphBounds(content: string, startOffset: number, endOffset: number): Bounds {
    const breakBefore = content.lastIndexOf('\n\n', startOffset);
    const start = breakBefore === -1 ? 0 : breakBefore + 2;

    const breakAfter = content.indexOf('\n\n', endOffset);
    const end = breakAfter === -1 ? content.length : breakAfter;

    return { end, start };
  }

  /**
   * Finds the Markdown section around the selection: from the nearest heading at or before the
   * selection down to the very next heading of any level (or the start/end of the document if
   * there's no such heading). Deliberately doesn't nest by heading level, so a section under an H1
   * stops at the next H2 instead of swallowing the whole subsection tree. If the selection comes
   * before any heading (a preamble), the section runs from the start of the document to the first
   * heading instead of swallowing the rest of the document.
   */
  private getSectionBounds(content: string, startOffset: number): Bounds {
    const headingPattern = /^#{1,6}\s+.*$/gm;

    let firstHeadingAfter: null | number = null;
    let lastHeadingIndex = -1;
    let match: null | RegExpExecArray;

    while ((match = headingPattern.exec(content))) {
      if (match.index > startOffset) {
        firstHeadingAfter = match.index;
        break;
      }

      lastHeadingIndex = match.index;
    }

    if (lastHeadingIndex === -1) {
      return { end: firstHeadingAfter ?? content.length, start: 0 };
    }

    headingPattern.lastIndex = lastHeadingIndex + 1;

    const nextMatch = headingPattern.exec(content);
    const end = nextMatch ? nextMatch.index : content.length;

    return { end, start: lastHeadingIndex };
  }

  private async handleGenerate(): Promise<void> {
    const revisionSelection = this.revisionSelection;

    if (this.isGenerating || !revisionSelection) {
      return;
    }

    const apiKey = this.plugin.getApiKey();

    if (!apiKey) {
      new Notice('Set your API key in Copyeditor settings first');

      return;
    }

    const promptFile = this.app.vault.getAbstractFileByPath(this.promptPath);

    if (!(promptFile instanceof TFile)) {
      new Notice('Pick a revision prompt file first');

      return;
    }

    this.isGenerating = true;
    this.generateButtonComponent?.setDisabled(true);
    new Notice('Generating revision...');

    let result: null | RevisionResult = null;

    try {
      const revisionPrompt = await this.app.vault.cachedRead(promptFile);
      const styleCardFile = this.styleCardPath ? this.app.vault.getAbstractFileByPath(this.styleCardPath) : null;
      const styleCard = styleCardFile instanceof TFile
        ? await this.app.vault.cachedRead(styleCardFile)
        : undefined;
      const scopeResult = this.computeScope(revisionSelection);

      const copyeditor = new Copyeditor({ client: new Client({ apiKey }) });

      result = await copyeditor.generateRevision({
        includeEstimatedCost: this.includeEstimatedCost,
        includePromptOptions: this.includePromptOptions,
        includeRevisionPromptPath: this.includeRevisionPromptPath,
        includeStyleCardPath: this.includeStyleCardPath,
        promptOptions: this.promptOptions,
        revisionPrompt,
        revisionPromptPath: this.promptPath,
        scope: scopeResult?.wrapped,
        selection: revisionSelection.selection,
        styleCard,
        styleCardPath: this.styleCardPath || undefined,
        userInstructions: this.instructions || undefined,
      });

      new Notice('Revision generated');
    } catch (error) {
      new Notice(`Failed to generate revision: ${(error as Error).message}!`);
    } finally {
      this.isGenerating = false;
      this.generateButtonComponent?.setDisabled(false);
    }

    if (result) {
      try {
        await this.renderResult(result);
      } catch (error) {
        console.error('[Copyeditor] Failed to render revision result', error);
      }
    }
  }

  /**
   * Highlights the rendered `<mark>` standing in for `<selection>` (Obsidian's Markdown renderer
   * strips unrecognized tags like `<selection>` entirely, so `<mark>` is used for display only)
   * with an inline background, without relying on Markdown syntax that could clash with Markdown
   * already present in the selected text itself.
   */
  private highlightSelectionTags(containerEl: HTMLElement): void {
    containerEl.querySelectorAll<HTMLElement>('mark').forEach((el) => {
      el.setCssStyles({ backgroundColor: 'var(--text-highlight-bg, rgba(255, 208, 0, 0.4))', borderRadius: '2px' });
    });
  }

  private async renderForm(): Promise<void> {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl('h2', { text: 'Revision' });

    if (!this.revisionSelection) {
      contentEl.createEl('p', { text: 'Select some text in a note, then send it to Revision.' });

      return;
    }

    const revisionSelection = this.revisionSelection;
    const { endOffset, path, selection, startOffset } = revisionSelection;

    new Setting(contentEl).setName('File').setDesc(path);
    new Setting(contentEl).setName('Offsets').setDesc(`${String(startOffset)} - ${String(endOffset)}`);

    new Setting(contentEl)
      .setName('Include Paragraph')
      .setDesc('Also send the whole paragraph around the selection')
      .addToggle(toggle => toggle.setValue(this.includeParagraph).onChange((value) => {
        this.includeParagraph = value;

        if (!value) {
          this.includeSection = false;
          this.includeFull = false;
        }

        void this.render();
      }));

    new Setting(contentEl)
      .setName('Include Section')
      .setDesc('Also send the whole section around the selection (turns on Include Paragraph too)')
      .addToggle(toggle => toggle.setValue(this.includeSection).onChange((value) => {
        this.includeSection = value;

        if (value) {
          this.includeParagraph = true;
        } else {
          this.includeFull = false;
        }

        void this.render();
      }));

    new Setting(contentEl)
      .setName('Include Full')
      .setDesc('Also send the whole document (turns on Include Section and Include Paragraph too)')
      .addToggle(toggle => toggle.setValue(this.includeFull).onChange((value) => {
        this.includeFull = value;

        if (value) {
          this.includeSection = true;
          this.includeParagraph = true;
        }

        void this.render();
      }));

    contentEl.createEl('h3', { text: `Selection (${String(selection.length)} chars)` });

    const selectionEl = contentEl.createDiv();

    await MarkdownRenderer.render(this.app, selection, selectionEl, path, this);

    const scopeResult = this.computeScope(revisionSelection);

    if (scopeResult) {
      const { bounds } = scopeResult;

      contentEl.createEl('h3', { text: `Scope (${String(bounds.end - bounds.start)} chars)` });

      const scopeEl = contentEl.createDiv();
      const renderable = scopeResult.wrapped.replace('<selection>', '<mark>').replace('</selection>', '</mark>');

      await MarkdownRenderer.render(this.app, renderable, scopeEl, path, this);
      this.highlightSelectionTags(scopeEl);
    }

    const markdownFiles = this.app.vault.getMarkdownFiles();

    contentEl.createEl('h3', { text: 'Revision Prompt' });

    new Setting(contentEl)
      .setName('Prompt File')
      .setDesc('File containing the revision prompt template')
      .addText((text) => {
        text.setPlaceholder('Search for a File...').setValue(this.promptPath).onChange((value) => {
          this.promptPath = value;
        });

        const suggest = new FileSuggest(this.app, text.inputEl, () => markdownFiles);

        suggest.onSelect((file) => {
          this.promptPath = file.path;
          text.setValue(file.path);
          suggest.close();
        });
      });

    contentEl.createEl('h3', { text: 'Style Card' });

    new Setting(contentEl)
      .setName('Style Card File')
      .setDesc('File containing the style card to write in')
      .addText((text) => {
        text.setPlaceholder('Search for a File...').setValue(this.styleCardPath).onChange((value) => {
          this.styleCardPath = value;
        });

        const suggest = new FileSuggest(this.app, text.inputEl, () => markdownFiles);

        suggest.onSelect((file) => {
          this.styleCardPath = file.path;
          text.setValue(file.path);
          suggest.close();
        });
      });

    contentEl.createEl('h3', { text: 'Instructions' });

    new Setting(contentEl)
      .setDesc('Optional additional instructions for the revision')
      .addTextArea(textArea => textArea.setPlaceholder('e.g. tighten this up, keep the tone casual...')
        .setValue(this.instructions)
        .onChange((value) => {
          this.instructions = value;
        }));

    contentEl.createEl('h3', { text: 'Prompt Options' });

    await new PromptOptionsPanel({
      apiKey: this.plugin.getApiKey() ?? '',
      containerEl: contentEl,
      defaults: this.promptOptions,
      onChange: (value): void => {
        this.promptOptions = value;
      },
    }).render();

    contentEl.createEl('h3', { text: 'Includes' });

    new Setting(contentEl)
      .setName('Include Estimated Cost')
      .setDesc('Include the estimated cost in Frontmatter')
      .addToggle(toggle => toggle.setValue(this.includeEstimatedCost).onChange((value) => {
        this.includeEstimatedCost = value;
      }));

    new Setting(contentEl)
      .setName('Include Prompt Options')
      .setDesc('Include the model, effort, thinking, and max tokens used in Frontmatter')
      .addToggle(toggle => toggle.setValue(this.includePromptOptions).onChange((value) => {
        this.includePromptOptions = value;
      }));

    new Setting(contentEl)
      .setName('Include Revision Prompt Path')
      .setDesc('Include the path to the revision prompt file used in Frontmatter')
      .addToggle(toggle => toggle.setValue(this.includeRevisionPromptPath).onChange((value) => {
        this.includeRevisionPromptPath = value;
      }));

    new Setting(contentEl)
      .setName('Include Style Card Path')
      .setDesc('Include the path to the style card file used in Frontmatter')
      .addToggle(toggle => toggle.setValue(this.includeStyleCardPath).onChange((value) => {
        this.includeStyleCardPath = value;
      }));

    new Setting(contentEl)
      .addButton((button) => {
        this.generateButtonComponent = button;

        button.setButtonText('Revise')
          .setCta()
          .onClick(() => {
            void this.handleGenerate();
          });
      });

    this.resultEl = contentEl.createDiv();
  }

  /**
   * Renders the revised content, estimated cost, and thinking output into the result area. Doesn't
   * write anything back to the vault yet — display only.
   */
  private async renderResult(result: RevisionResult): Promise<void> {
    const resultEl = this.resultEl;

    if (!resultEl) {
      return;
    }

    resultEl.empty();
    resultEl.createEl('h3', { text: 'Result' });
    resultEl.createEl('pre', { text: result.content });

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

  /**
   * Slices `content` down to `bounds` and wraps the selection within that slice in `<selection>`
   * tags.
   */
  private wrapRange(content: string, bounds: Bounds, revisionSelection: RevisionSelection): string {
    const { endOffset, startOffset } = revisionSelection;
    const text = content.slice(bounds.start, bounds.end);
    const relativeStart = startOffset - bounds.start;
    const relativeEnd = endOffset - bounds.start;

    return `${text.slice(0, relativeStart)}<selection>${text.slice(relativeStart, relativeEnd)}`
      + `</selection>${text.slice(relativeEnd)}`;
  }
}
