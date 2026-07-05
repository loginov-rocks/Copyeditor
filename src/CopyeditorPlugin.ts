import { Menu, Plugin } from 'obsidian';

import { CopyeditorPluginSettingTab } from './components/CopyeditorPluginSettingTab';
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

      menu.showAtMouseEvent(event);
    });

    this.addSettingTab(new CopyeditorPluginSettingTab(this.app, this));

    this.registerView(VIEW_TYPE_STYLE_CARD, leaf => new StyleCardView(leaf, this));

    this.addCommand({
      callback: () => {
        void this.activateStyleCardView();
      },
      id: 'open-style-card-view',
      name: 'Open Style Card Generator',
    });
  }

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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
}
