import type { PromptOptions } from './services/Client';

export interface CopyeditorPluginSettings {
  apiKeySecretId: string;
  defaultPromptOptions: PromptOptions;
  styleCard: StyleCardSettings;
}

interface StyleCardSettings {
  includeEstimatedCost: boolean;
  includePromptOptions: boolean;
  includeReferences: boolean;
}

export const DEFAULT_SETTINGS: CopyeditorPluginSettings = {
  apiKeySecretId: '',
  defaultPromptOptions: {
    maxTokens: 4096,
    model: 'claude-haiku-4-5',
  },
  styleCard: {
    includeEstimatedCost: true,
    includePromptOptions: true,
    includeReferences: true,
  },
};
