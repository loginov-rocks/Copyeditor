export type RevisionViewScopeKind = 'full' | 'paragraph' | 'section';

export interface RevisionViewScopeResult {
  bounds: Bounds;
  text: string;
}

interface Bounds {
  end: number;
  start: number;
}

/**
 * Pure computation of the scope sent to Revision alongside a selection: given the document content
 * and the selection's offsets, it resolves the surrounding paragraph/section/whole-document bounds
 * and wraps the selection within that slice in `<selection>` tags. Kept free of Obsidian so the
 * offset math can be unit-tested directly.
 */
export class RevisionViewScope {
  constructor(
    private readonly content: string,
    private readonly startOffset: number,
    private readonly endOffset: number,
  ) {}

  public select(kind: RevisionViewScopeKind): RevisionViewScopeResult {
    const bounds = this.bounds(kind);

    return { bounds, text: this.wrap(bounds) };
  }

  private bounds(kind: RevisionViewScopeKind): Bounds {
    if (kind === 'full') {
      return { end: this.content.length, start: 0 };
    }

    if (kind === 'section') {
      return this.sectionBounds();
    }

    return this.paragraphBounds();
  }

  /**
   * Finds the paragraph around the selection: the text between the nearest blank lines on either
   * side (or the start/end of the document).
   */
  private paragraphBounds(): Bounds {
    const breakBefore = this.content.lastIndexOf('\n\n', this.startOffset);
    const start = breakBefore === -1 ? 0 : breakBefore + 2;

    const breakAfter = this.content.indexOf('\n\n', this.endOffset);
    const end = breakAfter === -1 ? this.content.length : breakAfter;

    return { end, start };
  }

  /**
   * Finds the Markdown section around the selection: from the nearest heading at or before the
   * selection down to the very next heading of any level (or the start/end of the document if
   * there's no such heading). Deliberately doesn't nest by heading level, so a section under an H1
   * stops at the next H2 instead of swallowing the whole subsection tree. If the selection comes
   * before any heading (a preamble), the section runs from the start of the document to the first
   * heading instead of swallowing the rest of the document.
   */
  private sectionBounds(): Bounds {
    const headingPattern = /^#{1,6}\s+.*$/gm;

    let firstHeadingAfter: null | number = null;
    let lastHeadingIndex = -1;
    let match: null | RegExpExecArray;

    while ((match = headingPattern.exec(this.content))) {
      if (match.index > this.startOffset) {
        firstHeadingAfter = match.index;
        break;
      }

      lastHeadingIndex = match.index;
    }

    if (lastHeadingIndex === -1) {
      return { end: firstHeadingAfter ?? this.content.length, start: 0 };
    }

    headingPattern.lastIndex = lastHeadingIndex + 1;

    const nextMatch = headingPattern.exec(this.content);
    const end = nextMatch ? nextMatch.index : this.content.length;

    return { end, start: lastHeadingIndex };
  }

  /**
   * Slices the content down to `bounds` and wraps the selection within that slice in `<selection>`
   * tags.
   */
  private wrap(bounds: Bounds): string {
    const text = this.content.slice(bounds.start, bounds.end);
    const relativeStart = this.startOffset - bounds.start;
    const relativeEnd = this.endOffset - bounds.start;

    return `${text.slice(0, relativeStart)}<selection>${text.slice(relativeStart, relativeEnd)}`
      + `</selection>${text.slice(relativeEnd)}`;
  }
}
