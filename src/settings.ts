import { App, PluginSettingTab, Setting } from 'obsidian';

import CopyeditorPlugin from './main';

export interface CopyeditorPluginSettings {
  mySetting: string;
}

export const DEFAULT_SETTINGS: CopyeditorPluginSettings = {
  mySetting: 'default',
};

interface SettingDefinition {
  control: {
    key: keyof CopyeditorPluginSettings;
    placeholder: string;
    type: 'text';
  };
  description: string;
  name: string;
}

export class SomeSettingTab extends PluginSettingTab {
  private readonly plugin: CopyeditorPlugin;

  constructor(app: App, plugin: CopyeditorPlugin) {
    super(app, plugin);

    this.plugin = plugin;
  }

  public display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Settings #1')
      .setDesc('It\'s a secret')
      .addText(text =>
        text
          .setPlaceholder('Enter your secret')
          .setValue(this.plugin.settings.mySetting)
          .onChange(async (value) => {
            this.plugin.settings.mySetting = value;
            await this.plugin.saveSettings();
          }),
      );
  }

  public getSettingDefinitions(): SettingDefinition[] {
    return [
      {
        control: {
          key: 'mySetting',
          placeholder: 'Enter your secret',
          type: 'text',
        },
        description: 'It\'s a secret',
        name: 'Settings #1',
      },
    ];
  }
}
