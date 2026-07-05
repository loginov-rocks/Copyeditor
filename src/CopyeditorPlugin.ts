import type { Editor, MarkdownFileInfo, MarkdownView } from 'obsidian';

import { Menu, Notice, Plugin, type WorkspaceLeaf } from 'obsidian';

import { CopyeditorPluginSettingTab } from './components/CopyeditorPluginSettingTab';
import { RevisionView, VIEW_TYPE_REVISION } from './components/RevisionView';
import { StyleCardView, VIEW_TYPE_STYLE_CARD } from './components/StyleCardView';
import { type CopyeditorPluginSettings, DEFAULT_SETTINGS } from './settings';

/**
 * Plugin entry point: loads and saves settings, registers the settings tab, the ribbon menu, and
 * the style card generator view.
 */
export class CopyeditorPlugin extends Plugin {
  public settings!: CopyeditorPluginSettings;

  public getApiKey(): null | string {
    const { apiKeySecretId } = this.settings;

    return apiKeySecretId ? this.app.secretStorage.getSecret(apiKeySecretId) : null;
  }

  public async loadSettings(): Promise<void> {
    const loadedSettings = (await this.loadData()) as null | Partial<CopyeditorPluginSettings>;

    // Merge each nested settings group against its own defaults (not just the top level), so that a field added to
    // defaultPromptOptions/styleCard later still gets a default value for users who saved settings before that field
    // existed, instead of silently becoming undefined.
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loadedSettings,
      defaultPromptOptions: { ...DEFAULT_SETTINGS.defaultPromptOptions, ...loadedSettings?.defaultPromptOptions },
      revision: { ...DEFAULT_SETTINGS.revision, ...loadedSettings?.revision },
      styleCard: { ...DEFAULT_SETTINGS.styleCard, ...loadedSettings?.styleCard },
    };
  }

  public async onload(): Promise<void> {
    await this.loadSettings();

    this.addRibbonIcon('pen-tool', 'Copyeditor', (event: MouseEvent) => {
      const menu = new Menu();

      menu.addItem(item => item.setTitle('Open Style Card Generator').onClick(() => {
        void this.activateStyleCardView();
      }));

      menu.addItem(item => item.setTitle('Open Revision Panel').onClick(() => {
        void this.activateRevisionView();
      }));

      menu.showAtMouseEvent(event);
    });

    this.addSettingTab(new CopyeditorPluginSettingTab(this.app, this));

    this.registerView(VIEW_TYPE_STYLE_CARD, leaf => new StyleCardView(leaf, this));
    this.registerView(VIEW_TYPE_REVISION, leaf => new RevisionView(leaf, this));

    this.addCommand({
      callback: () => {
        void this.activateStyleCardView();
      },
      id: 'open-style-card-view',
      name: 'Open Style Card Generator',
    });

    this.addCommand({
      editorCallback: (editor: Editor, ctx: MarkdownFileInfo | MarkdownView) => {
        void this.sendSelectionToRevision(editor, ctx);
      },
      id: 'send-selection-to-revision',
      name: 'Send Selection to Revision',
    });

    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, ctx) => {
      if (!editor.getSelection()) {
        return;
      }

      menu.addItem(item => item
        .setIcon('pen-tool')
        .setTitle('Send Selection to Revision')
        .onClick(() => {
          void this.sendSelectionToRevision(editor, ctx);
        }));
    }));
  }

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async activateRevisionView(): Promise<undefined | WorkspaceLeaf> {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE_REVISION)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);

      if (!rightLeaf) {
        return undefined;
      }

      leaf = rightLeaf;
      await leaf.setViewState({ active: true, type: VIEW_TYPE_REVISION });
    }

    await workspace.revealLeaf(leaf);

    return leaf;
  }

  private async activateStyleCardView(): Promise<void> {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE_STYLE_CARD)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);

      if (!rightLeaf) {
        return;
      }

      leaf = rightLeaf;
      await leaf.setViewState({ active: true, type: VIEW_TYPE_STYLE_CARD });
    }

    await workspace.revealLeaf(leaf);
  }

  private async sendSelectionToRevision(editor: Editor, ctx: MarkdownFileInfo | MarkdownView): Promise<void> {
    const revisionSelection = RevisionView.buildSelection(this.app, editor, ctx);

    if (!revisionSelection) {
      new Notice('Select some text first');

      return;
    }

    const leaf = await this.activateRevisionView();
    const view = leaf?.view;

    if (view instanceof RevisionView) {
      await view.setSelection(revisionSelection);
    }
  }
}
