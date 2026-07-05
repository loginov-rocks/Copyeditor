import { parseYaml, stringifyYaml } from 'obsidian';

import { Client, type PromptOptions } from './Client';

export interface StyleCardResult {
  content: string;
  estimatedCost: null | number;
  thinkingContent: string;
}

interface Options {
  client: Client;
}

interface Reference {
  content: string;
  path: string;
}

interface StyleCardOptions {
  includeEstimatedCost: boolean;
  includePromptOptions: boolean;
  includeReferences: boolean;
  promptOptions: PromptOptions;
  references: Reference[];
  userPrompt: string;
}

/**
 * Business-logic layer for the plugin's operations (e.g. generating style cards): builds prompts
 * and orchestrates a Client, independent of Obsidian's UI and Vault APIs.
 */
export class Copyeditor {
  private readonly client: Client;

  constructor({ client }: Options) {
    this.client = client;
  }

  public async generateStyleCard({
    includeEstimatedCost, includePromptOptions, includeReferences, promptOptions, references, userPrompt,
  }: StyleCardOptions): Promise<StyleCardResult> {
    if (references.length === 0) {
      throw new Error('At least one reference is required to generate a style card!');
    }

    const referencesTag = /<references\s*\/\s*>/g;

    if (!referencesTag.test(userPrompt)) {
      throw new Error('User prompt must include a <references /> tag!');
    }

    const referencesBlock = references
      .map(reference => `<reference path="${reference.path}">\n${reference.content}\n</reference>`)
      .join('\n\n');
    const prompt = userPrompt.replace(referencesTag, `<references>\n${referencesBlock}\n</references>`);

    const result = await this.client.prompt(prompt, promptOptions);

    let content = result.textBlocks.join('');

    const frontmatter: Record<string, boolean | number | string> = {};
    if (includePromptOptions && promptOptions.effort !== undefined) {
      frontmatter.copyeditor_effort = promptOptions.effort;
    }
    if (includeEstimatedCost && result.estimatedCost !== null) {
      frontmatter.copyeditor_estimatedCost = result.estimatedCost;
    }
    if (includePromptOptions && promptOptions.maxTokens) {
      frontmatter.copyeditor_maxTokens = promptOptions.maxTokens;
    }
    if (includePromptOptions && promptOptions.model) {
      frontmatter.copyeditor_model = promptOptions.model;
    }
    if (includePromptOptions && promptOptions.thinking !== undefined) {
      frontmatter.copyeditor_thinking = promptOptions.thinking;
    }
    if (Object.keys(frontmatter).length > 0) {
      content = this.upsertFrontmatter(content, frontmatter);
    }

    if (includeReferences && references.length > 0) {
      const links = references.map(reference => `- [[${reference.path}]]`).join('\n');
      content = `${content}\n\n## References\n${links}\n`;
    }

    return {
      content,
      estimatedCost: result.estimatedCost,
      thinkingContent: result.thinkingBlocks.join('\n\n'),
    };
  }

  /**
   * Inserts or updates frontmatter properties, creating the frontmatter block if it doesn't exist
   * yet, and overwriting any of these keys that are already present. Works with a single property
   * or many, since it's just a Record either way.
   */
  private upsertFrontmatter(text: string, properties: Record<string, unknown>): string {
    const frontmatterMatch = /^---\n([\s\S]*?)\n---\n/.exec(text);

    if (!frontmatterMatch) {
      const propertyLines = stringifyYaml(properties).trimEnd();

      return `---\n${propertyLines}\n---\n\n${text}`;
    }

    const existingFrontmatter = (parseYaml(frontmatterMatch[1] ?? '') ?? {}) as Record<string, unknown>;
    const mergedFrontmatter = { ...existingFrontmatter, ...properties };
    const propertyLines = stringifyYaml(mergedFrontmatter).trimEnd();

    return text.replace(frontmatterMatch[0], `---\n${propertyLines}\n---\n`);
  }
}
