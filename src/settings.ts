import type { PromptOptions } from './services/Client';

export interface CopyeditorPluginSettings {
  apiKeySecretId: string;
  defaultPromptOptions: PromptOptions;
  revision: RevisionSettings;
  styleCard: StyleCardSettings;
}

interface RevisionSettings {
  includeEstimatedCost: boolean;
  includePromptOptions: boolean;
  includeRevisionPromptPath: boolean;
  includeStyleCardPath: boolean;
}

interface StyleCardSettings {
  includeEstimatedCost: boolean;
  includePromptOptions: boolean;
  includeReferences: boolean;
  includeUserPromptPath: boolean;
}

export const DEFAULT_SETTINGS: CopyeditorPluginSettings = {
  apiKeySecretId: '',
  defaultPromptOptions: {
    maxTokens: 4096,
    model: 'claude-haiku-4-5',
  },
  revision: {
    includeEstimatedCost: true,
    includePromptOptions: true,
    includeRevisionPromptPath: true,
    includeStyleCardPath: true,
  },
  styleCard: {
    includeEstimatedCost: true,
    includePromptOptions: true,
    includeReferences: true,
    includeUserPromptPath: true,
  },
};
