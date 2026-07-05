import { describe, expect, it } from '@jest/globals';

import { RevisionViewScope } from './RevisionViewScope';

function scopeOf(content: string, target: string): RevisionViewScope {
  const startOffset = content.indexOf(target);

  return new RevisionViewScope(content, startOffset, startOffset + target.length);
}

describe('RevisionViewScope paragraph', () => {
  it('spans the blank lines on either side of the selection', () => {
    const content = 'First para.\n\nSecond para has the target word.\n\nThird para.';

    const { bounds, text } = scopeOf(content, 'target').select('paragraph');

    expect(content.slice(bounds.start, bounds.end)).toBe('Second para has the target word.');
    expect(text).toBe('Second para has the <selection>target</selection> word.');
  });

  it('runs from the start of the document for the first paragraph', () => {
    const content = 'Alpha beta gamma.\n\nNext para.';

    const { bounds } = scopeOf(content, 'beta').select('paragraph');

    expect(bounds.start).toBe(0);
    expect(content.slice(bounds.start, bounds.end)).toBe('Alpha beta gamma.');
  });

  it('runs to the end of the document for the last paragraph', () => {
    const content = 'Intro.\n\nFinal paragraph here.';

    const { bounds } = scopeOf(content, 'here').select('paragraph');

    expect(bounds.end).toBe(content.length);
    expect(content.slice(bounds.start, bounds.end)).toBe('Final paragraph here.');
  });
});

describe('RevisionViewScope section', () => {
  it('stops at the next heading of any level rather than nesting under it', () => {
    const content = '# Big\n\nUnder big.\n\n## Small\n\nUnder small.';

    const { bounds, text } = scopeOf(content, 'Under big').select('section');

    expect(content.slice(bounds.start, bounds.end)).toBe('# Big\n\nUnder big.\n\n');
    expect(text).toContain('<selection>Under big</selection>');
    expect(text).not.toContain('## Small');
  });

  it('runs from the document start to the first heading for a preamble selection', () => {
    const content = 'Preamble text.\n\n# First Heading\n\nBody.';

    const { bounds } = scopeOf(content, 'Preamble').select('section');

    expect(content.slice(bounds.start, bounds.end)).toBe('Preamble text.\n\n');
  });

  it('spans the whole document when there are no headings', () => {
    const content = 'Just a paragraph.\n\nAnother one.';

    const { bounds } = scopeOf(content, 'Another').select('section');

    expect(bounds).toEqual({ end: content.length, start: 0 });
  });
});

describe('RevisionViewScope full', () => {
  it('spans the whole document and wraps the selection in place', () => {
    const content = 'A\n\nB target C\n\nD';

    const { bounds, text } = scopeOf(content, 'target').select('full');

    expect(bounds).toEqual({ end: content.length, start: 0 });
    expect(text).toBe('A\n\nB <selection>target</selection> C\n\nD');
  });
});
