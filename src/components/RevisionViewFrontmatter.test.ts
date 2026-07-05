import { describe, expect, it } from '@jest/globals';

import { RevisionViewFrontmatter } from './RevisionViewFrontmatter';

describe('RevisionViewFrontmatter.promptOptions', () => {
  it('reads every recognized copyeditor_* option', () => {
    const options = new RevisionViewFrontmatter({
      copyeditor_effort: 'high',
      copyeditor_maxTokens: 2048,
      copyeditor_model: 'claude-opus-4-8',
      copyeditor_thinking: true,
    }).promptOptions();

    expect(options).toEqual({
      effort: 'high',
      maxTokens: 2048,
      model: 'claude-opus-4-8',
      thinking: true,
    });
  });

  it('returns an empty object when there is no frontmatter', () => {
    expect(new RevisionViewFrontmatter(undefined).promptOptions()).toEqual({});
  });

  it('ignores an effort value that is not a known effort level', () => {
    const options = new RevisionViewFrontmatter({ copyeditor_effort: 'turbo' }).promptOptions();

    expect(options).not.toHaveProperty('effort');
  });

  it('ignores options whose type does not match', () => {
    const options = new RevisionViewFrontmatter({
      copyeditor_maxTokens: '2048',
      copyeditor_model: 42,
      copyeditor_thinking: 'yes',
    }).promptOptions();

    expect(options).toEqual({});
  });

  it('keeps only the options that are present and valid', () => {
    const options = new RevisionViewFrontmatter({
      copyeditor_model: 'claude-haiku-4-5',
      copyeditor_thinking: false,
    }).promptOptions();

    expect(options).toEqual({ model: 'claude-haiku-4-5', thinking: false });
  });
});
