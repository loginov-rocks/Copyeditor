import { Client, type ModelEffort, type PromptOptions } from '../services/Client';

/**
 * Reads the plugin's `copyeditor_*` keys off a revision source note's frontmatter. Kept free of
 * Obsidian (it works on an already-resolved frontmatter record) so the parsing rules can be
 * unit-tested directly.
 */
export class RevisionViewFrontmatter {
  constructor(private readonly frontmatter: Record<string, unknown> | undefined) {}

  /**
   * Reads the `copyeditor_*` prompt option overrides, so a note that was produced by (or previously
   * revised with) this plugin re-applies the same model/effort/maxTokens/thinking the next time
   * it's sent to Revision. Unrecognized or wrong-typed values are ignored rather than passed through.
   */
  public promptOptions(): Partial<PromptOptions> {
    const promptOptions: Partial<PromptOptions> = {};
    const effort = this.frontmatter?.copyeditor_effort;

    if (typeof effort === 'string' && Client.MODEL_EFFORTS.includes(effort as ModelEffort)) {
      promptOptions.effort = effort as ModelEffort;
    }
    if (typeof this.frontmatter?.copyeditor_maxTokens === 'number') {
      promptOptions.maxTokens = this.frontmatter.copyeditor_maxTokens;
    }
    if (typeof this.frontmatter?.copyeditor_model === 'string') {
      promptOptions.model = this.frontmatter.copyeditor_model;
    }
    if (typeof this.frontmatter?.copyeditor_thinking === 'boolean') {
      promptOptions.thinking = this.frontmatter.copyeditor_thinking;
    }

    return promptOptions;
  }
}
