import { Setting } from 'obsidian';

import { Client, type ModelOption, type PromptOptions } from '../services/Client';

interface Options {
  apiKey: string;
  containerEl: HTMLElement;
  defaults: PromptOptions;
  onChange: (value: PromptOptions) => void;
}

/**
 * Renders the model, thinking, and effort controls shared by every operation that calls a Client.
 */
export class PromptOptionsPanel {
  private static readonly EFFORT_DEFAULT_OPTION = 'default';
  private static readonly modelOptionsCache = new Map<string, ModelOption[]>();

  private readonly apiKey: string;
  private capabilitiesEl: HTMLElement | null = null;
  private current: PromptOptions;
  private models: ModelOption[] = [];
  private readonly onChange: (value: PromptOptions) => void;
  private readonly panelEl: HTMLElement;

  constructor({ apiKey, containerEl, defaults, onChange }: Options) {
    this.apiKey = apiKey;
    this.current = { ...defaults };
    this.onChange = onChange;
    this.panelEl = containerEl.createDiv();
  }

  public async render(): Promise<void> {
    this.panelEl.empty();

    const loadingEl = this.panelEl.createEl('p', { text: 'Loading Model List...' });

    this.models = await this.loadModels();

    loadingEl.remove();

    const [firstModel] = this.models;

    if (firstModel && !this.models.some(model => model.id === this.current.model)) {
      this.current.model = firstModel.id;
    }

    this.capabilitiesEl = this.panelEl.createDiv();

    new Setting(this.panelEl)
      .setName('Model')
      .setDesc('Model used for this operation')
      .addDropdown((dropdown) => {
        dropdown.addOptions(Object.fromEntries(this.models.map(model => [model.id, model.name])));

        dropdown.setValue(this.current.model).onChange((value) => {
          this.current.model = value;
          this.renderCapabilityControls(this.findModel(value));
          this.onChange({ ...this.current });
        });
      });

    this.renderCapabilityControls(this.findModel(this.current.model));
  }

  private findModel(modelId: string): ModelOption | undefined {
    return this.models.find(model => model.id === modelId);
  }

  private async loadModels(): Promise<ModelOption[]> {
    const fallback: ModelOption[] = [
      { effort: [], id: this.current.model, maxTokens: null, name: this.current.model, thinking: false },
    ];

    if (!this.apiKey) {
      return fallback;
    }

    const cachedModelOptions = PromptOptionsPanel.modelOptionsCache.get(this.apiKey);

    if (cachedModelOptions) {
      return cachedModelOptions;
    }

    try {
      const modelOptions = await new Client({ apiKey: this.apiKey }).listModelOptions();

      PromptOptionsPanel.modelOptionsCache.set(this.apiKey, modelOptions);

      return modelOptions;
    } catch (error) {
      console.error('[Copyeditor] Failed to list models', error);

      return fallback;
    }
  }

  private renderCapabilityControls(model: ModelOption | undefined): void {
    const capabilitiesEl = this.capabilitiesEl;

    if (!capabilitiesEl) {
      return;
    }

    capabilitiesEl.empty();

    if (model?.thinking) {
      new Setting(capabilitiesEl)
        .setName('Thinking')
        .setDesc('Let the model reason before answering')
        .addToggle(toggle => toggle.setValue(this.current.thinking ?? false).onChange((value) => {
          this.current.thinking = value;
          this.onChange({ ...this.current });
        }));
    } else {
      this.current.thinking = false;
    }

    const supportedEfforts = model?.effort ?? [];

    if (supportedEfforts.length > 0) {
      if (!this.current.effort || !supportedEfforts.includes(this.current.effort)) {
        this.current.effort = undefined;
      }

      new Setting(capabilitiesEl)
        .setName('Effort')
        .setDesc('Reasoning effort')
        .addDropdown((dropdown) => {
          dropdown.addOptions({
            [PromptOptionsPanel.EFFORT_DEFAULT_OPTION]: 'Model Default',
            ...Object.fromEntries(supportedEfforts.map(effort => [effort, Client.MODEL_EFFORT_DISPLAY_NAMES[effort]])),
          });

          dropdown.setValue(this.current.effort ?? PromptOptionsPanel.EFFORT_DEFAULT_OPTION).onChange((value) => {
            this.current.effort = supportedEfforts.find(effort => effort === value);
            this.onChange({ ...this.current });
          });
        });
    } else {
      this.current.effort = undefined;
    }

    new Setting(capabilitiesEl)
      .setName('Max Tokens')
      .setDesc(model?.maxTokens
        ? `Maximum tokens the model can generate (up to ${String(model.maxTokens)} for this model)`
        : 'Maximum tokens the model can generate')
      .addText((text) => {
        text.inputEl.type = 'number';

        text.setValue(String(this.current.maxTokens)).onChange((value) => {
          const parsed = Number(value);

          if (Number.isFinite(parsed) && parsed > 0) {
            this.current.maxTokens = parsed;
            this.onChange({ ...this.current });
          }
        });
      });
  }
}
