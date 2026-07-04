import { Editor, MarkdownFileInfo, MarkdownView, Modal, Notice, Plugin } from 'obsidian';

import { CopyeditorPluginSettings, DEFAULT_SETTINGS, SomeSettingTab } from './settings';

class SomeModal extends Modal {
  public onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  public onOpen(): void {
    const { contentEl } = this;
    contentEl.setText('Woah!');
  }
}

// Remember to rename these classes and interfaces!
export default class CopyeditorPlugin extends Plugin {
  public settings!: CopyeditorPluginSettings;

  public async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<CopyeditorPluginSettings>);
  }

  public async onload(): Promise<void> {
    await this.loadSettings();

    // This creates an icon in the left ribbon.
    this.addRibbonIcon('dice', 'Sample', (_evt: MouseEvent) => {
      // Called when the user clicks the icon.
      new Notice('This is a notice!');
    });

    // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
    const statusBarItemEl = this.addStatusBarItem();
    statusBarItemEl.setText('Status bar text');

    // This adds a simple command that can be triggered anywhere
    this.addCommand({
      callback: () => {
        new SomeModal(this.app).open();
      },
      id: 'open-modal-simple',
      name: 'Open modal (simple)',
    });

    // This adds an editor command that can perform some operation on the current editor instance
    this.addCommand({
      editorCallback: (editor: Editor, _ctx: MarkdownFileInfo | MarkdownView) => {
        editor.replaceSelection('Sample editor command');
      },
      id: 'replace-selected',
      name: 'Replace selected content',
    });

    // This adds a complex command that can check whether the current state of the app allows execution of the command
    this.addCommand({
      checkCallback: (checking: boolean) => {
        // Conditions to check
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);

        if (markdownView) {
          // If checking is true, we're simply "checking" if the command can be run.
          // If checking is false, then we want to actually perform the operation.
          if (!checking) {
            new SomeModal(this.app).open();
          }

          // This command will only show up in Command Palette when the check function returns true
          return true;
        }

        return false;
      },
      id: 'open-modal-complex',
      name: 'Open modal (complex)',
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new SomeSettingTab(this.app, this));

    // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
    // Using this function will automatically remove the event listener when this plugin is disabled.
    this.registerDomEvent(activeDocument, 'click', (_evt: MouseEvent) => {
      new Notice('Click');
    });

    // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
    // this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
  }

  public onunload(): void {
    //
  }

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
