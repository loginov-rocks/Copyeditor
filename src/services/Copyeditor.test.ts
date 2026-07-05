import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { Client } from './Client';

import { Copyeditor } from './Copyeditor';

type RevisionOptions = Parameters<Copyeditor['generateRevision']>[0];
type StyleCardOptions = Parameters<Copyeditor['generateStyleCard']>[0];

// Copyeditor takes a Client in its constructor and only ever calls `prompt`, so a stub with a
// single mocked method is all that's needed — no Anthropic SDK involved.
const prompt = jest.fn<Client['prompt']>();
const copyeditor = new Copyeditor({ client: { prompt } as unknown as Client });

function revisionOptions(overrides: Partial<RevisionOptions> = {}): RevisionOptions {
  return {
    includeEstimatedCost: true,
    includePromptOptions: true,
    includeRevisionPromptPath: true,
    includeStyleCardPath: true,
    promptOptions: { effort: 'high', maxTokens: 1024, model: 'claude-opus-4-8', thinking: true },
    revisionPrompt: 'Revise:\n<selection />\nScope:\n<scope />\nStyle:\n<style-card />\nExtra:\n<instructions />',
    revisionPromptPath: 'prompts/revise.md',
    scope: 'surrounding text',
    selection: 'the selected text',
    styleCard: 'Style card content',
    styleCardPath: 'cards/voice.md',
    userInstructions: 'Keep it short',
    ...overrides,
  };
}

function styleCardOptions(overrides: Partial<StyleCardOptions> = {}): StyleCardOptions {
  return {
    includeEstimatedCost: true,
    includePromptOptions: true,
    includeReferences: true,
    includeUserPromptPath: true,
    promptOptions: { maxTokens: 1024, model: 'claude-haiku-4-5' },
    references: [
      { content: 'First sample.', path: 'refs/a.md' },
      { content: 'Second sample.', path: 'refs/b.md' },
    ],
    userPrompt: 'Analyze these:\n<references />',
    userPromptPath: 'prompts/style.md',
    ...overrides,
  };
}

beforeEach(() => {
  prompt.mockReset();
  prompt.mockResolvedValue({ estimatedCost: 0.0123, textBlocks: ['Generated body'], thinkingBlocks: [] });
});

describe('Copyeditor.generateStyleCard', () => {
  it('throws when there are no references', async () => {
    await expect(copyeditor.generateStyleCard(styleCardOptions({ references: [] })))
      .rejects.toThrow('At least one reference is required');
  });

  it('throws when the prompt has no <references /> tag', async () => {
    await expect(copyeditor.generateStyleCard(styleCardOptions({ userPrompt: 'No tag here' })))
      .rejects.toThrow('User prompt must include a <references /> tag');
  });

  it('expands the <references /> tag into a block wrapping each reference by path', async () => {
    await copyeditor.generateStyleCard(styleCardOptions());

    const promptArg = prompt.mock.calls.at(0)?.[0];

    expect(promptArg).toContain('<references>');
    expect(promptArg).toContain('<reference path="refs/a.md">\nFirst sample.\n</reference>');
    expect(promptArg).toContain('<reference path="refs/b.md">\nSecond sample.\n</reference>');
    expect(promptArg).not.toContain('<references />');
  });

  it('adds frontmatter for the enabled includes and appends a References section', async () => {
    const result = await copyeditor.generateStyleCard(styleCardOptions());

    expect(result.content).toContain('copyeditor_model: claude-haiku-4-5');
    expect(result.content).toContain('copyeditor_userPromptPath: prompts/style.md');
    expect(result.content).toContain('copyeditor_estimatedCost:');
    expect(result.content).toContain('Generated body');
    expect(result.content).toContain('## References');
    expect(result.content).toContain('- [[refs/a.md]]');
    expect(result.content).toContain('- [[refs/b.md]]');
  });

  it('omits frontmatter and the References section when every include is disabled', async () => {
    const result = await copyeditor.generateStyleCard(styleCardOptions({
      includeEstimatedCost: false,
      includePromptOptions: false,
      includeReferences: false,
      includeUserPromptPath: false,
    }));

    expect(result.content).not.toContain('copyeditor_');
    expect(result.content).not.toContain('## References');
    expect(result.content).toBe('Generated body');
  });
});

describe('Copyeditor.generateRevision', () => {
  it('throws when the selection is empty', async () => {
    await expect(copyeditor.generateRevision(revisionOptions({ selection: '' })))
      .rejects.toThrow('A selection is required');
  });

  it('throws when the prompt has no <selection /> tag', async () => {
    await expect(copyeditor.generateRevision(revisionOptions({ revisionPrompt: 'No tag here' })))
      .rejects.toThrow('Revision prompt must include a <selection /> tag');
  });

  it('expands the selection, scope, style card, and instruction tags', async () => {
    await copyeditor.generateRevision(revisionOptions());

    const promptArg = prompt.mock.calls.at(0)?.[0];

    expect(promptArg).toContain('<selection>\nthe selected text\n</selection>');
    expect(promptArg).toContain('<scope>\nsurrounding text\n</scope>');
    expect(promptArg).toContain('<style-card>\nStyle card content\n</style-card>');
    expect(promptArg).toContain('<instructions>\nKeep it short\n</instructions>');
    expect(promptArg).not.toContain('<selection />');
  });

  it('records the prompt options and paths as frontmatter and joins the thinking blocks', async () => {
    prompt.mockResolvedValue({
      estimatedCost: 0.5,
      textBlocks: ['Revised body'],
      thinkingBlocks: ['first thought', 'second thought'],
    });

    const result = await copyeditor.generateRevision(revisionOptions());

    expect(result.content).toContain('copyeditor_model: claude-opus-4-8');
    expect(result.content).toContain('copyeditor_effort: high');
    expect(result.content).toContain('copyeditor_thinking: true');
    expect(result.content).toContain('copyeditor_revisionPromptPath: prompts/revise.md');
    expect(result.content).toContain('copyeditor_styleCardPath: cards/voice.md');
    expect(result.thinkingContent).toBe('first thought\n\nsecond thought');
  });

  it('merges its frontmatter into frontmatter the model already produced', async () => {
    prompt.mockResolvedValue({
      estimatedCost: null,
      textBlocks: ['---\nexisting: kept\n---\n\nRevised body'],
      thinkingBlocks: [],
    });

    const result = await copyeditor.generateRevision(revisionOptions({ includeEstimatedCost: false }));

    expect(result.content).toContain('existing: kept');
    expect(result.content).toContain('copyeditor_model: claude-opus-4-8');
    expect(result.content).toContain('Revised body');
  });
});
