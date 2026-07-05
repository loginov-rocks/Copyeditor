import { AbstractInputSuggest, type App, type TFile } from 'obsidian';

/**
 * Text-input autocomplete that suggests vault files matching the typed substring.
 */
export class FileSuggest extends AbstractInputSuggest<TFile> {
  constructor(app: App, inputEl: HTMLInputElement, private readonly getFiles: () => TFile[]) {
    super(app, inputEl);
  }

  public renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path);
  }

  protected getSuggestions(query: string): TFile[] {
    const lowerQuery = query.toLowerCase();

    return this.getFiles().filter(file => file.path.toLowerCase().includes(lowerQuery));
  }
}
