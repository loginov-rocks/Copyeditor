import { App, PluginSettingTab, SecretComponent, Setting } from 'obsidian';

import type { CopyeditorPlugin } from '../CopyeditorPlugin';

import { PromptOptionsPanel } from './PromptOptionsPanel';

/**
 * Settings tab for the API key, default prompt options, and default style card frontmatter toggles.
 */
export class CopyeditorPluginSettingTab extends PluginSettingTab {
  private readonly plugin: CopyeditorPlugin;

  constructor(app: App, plugin: CopyeditorPlugin) {
    super(app, plugin);

    this.plugin = plugin;
  }

  public display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Claude API key')
      .addComponent(el => new SecretComponent(this.app, el)
        .setValue(this.plugin.settings.apiKeySecretId)
        .onChange(async (value) => {
          this.plugin.settings.apiKeySecretId = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName('Default Prompt Options').setHeading();

    void new PromptOptionsPanel({
      apiKey: this.plugin.getApiKey() ?? '',
      containerEl,
      defaults: this.plugin.settings.defaultPromptOptions,
      onChange: (value): void => {
        this.plugin.settings.defaultPromptOptions = value;
        void this.plugin.saveSettings();
      },
    }).render();

    new Setting(containerEl).setName('Revision').setHeading();

    new Setting(containerEl)
      .setName('Include Estimated Cost')
      .setDesc('Include the estimated cost in Frontmatter')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.revision.includeEstimatedCost).onChange(async (value) => {
          this.plugin.settings.revision.includeEstimatedCost = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Include Prompt Options')
      .setDesc('Include the model, effort, thinking, and max tokens used in Frontmatter')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.revision.includePromptOptions).onChange(async (value) => {
          this.plugin.settings.revision.includePromptOptions = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Include Revision Prompt Path')
      .setDesc('Include the path to the revision prompt file used in Frontmatter')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.revision.includeRevisionPromptPath).onChange(async (value) => {
          this.plugin.settings.revision.includeRevisionPromptPath = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Include Style Card Path')
      .setDesc('Include the path to the style card file used in Frontmatter')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.revision.includeStyleCardPath).onChange(async (value) => {
          this.plugin.settings.revision.includeStyleCardPath = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).setName('Style Card').setHeading();

    new Setting(containerEl)
      .setName('Include Estimated Cost')
      .setDesc('Include the estimated cost in Frontmatter')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.styleCard.includeEstimatedCost).onChange(async (value) => {
          this.plugin.settings.styleCard.includeEstimatedCost = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Include Prompt Options')
      .setDesc('Include the model, effort, thinking, and max tokens used in Frontmatter')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.styleCard.includePromptOptions).onChange(async (value) => {
          this.plugin.settings.styleCard.includePromptOptions = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Include References')
      .setDesc('Append a "## References" section with links to the reference files used')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.styleCard.includeReferences).onChange(async (value) => {
        this.plugin.settings.styleCard.includeReferences = value;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName('Include User Prompt Path')
      .setDesc('Include the path to the prompt file used in Frontmatter')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.styleCard.includeUserPromptPath).onChange(async (value) => {
          this.plugin.settings.styleCard.includeUserPromptPath = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}
