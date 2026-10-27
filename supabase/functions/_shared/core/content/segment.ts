// Splits extracted text into passages (CONTENT_GOVERNANCE §5, CNT-4). Pure and resumable: the state
// is JSON, so a PDF can be segmented in page batches across Edge Function invocations.

export const MIN_PASSAGE_CHARS = 500;
export const MAX_PASSAGE_CHARS = 2000;

export type PageText = { page: number | null; text: string };

export type Passage = {
  ordinal: number;
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
  charStart: number;
  charEnd: number;
  sectionPath: string | null;
};

type PageMark = { at: number; page: number | null };

export type SegmentState = {
  /** Next passage ordinal (1-based). */
  ordinal: number;
  /** Length of the source text consumed so far; pages are joined with "\n". */
  offset: number;
  section: string | null;
  /** Text not yet emitted, as an exact slice of the source text starting at `start`. */
  carry: { text: string; start: number; marks: PageMark[]; section: string | null } | null;
};

export const initialSegmentState = (): SegmentState => ({
  ordinal: 1,
  offset: 0,
  section: null,
  carry: null,
});

const HEADING_MAX = 80;

/** Unicode NFC with control characters removed (SECURITY §6); tabs and newlines are kept. */
export function cleanText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/** Markdown headings, or short title-like lines without closing punctuation. */
export function headingOf(line: string): string | null {
  const trimmed = line.trim();
  const markdown = /^#{1,6}\s+(.+)$/.exec(trimmed);
  if (markdown?.[1]) return markdown[1].trim().slice(0, 300);
  if (trimmed.length < 3 || trimmed.length > HEADING_MAX) return null;
  if (/[.!?:;,]$/.test(trimmed) || !/^[A-Z0-9]/.test(trimmed) || !/[a-z]/i.test(trimmed))
    return null;
  if (trimmed.split(/\s+/).length > 10) return null;
  return trimmed;
}

/**
 * Adds pages to the running segmentation. Passages break at headings and blank lines once they
 * reach MIN_PASSAGE_CHARS, and are cut at a sentence or word boundary before MAX_PASSAGE_CHARS.
 * With `final`, the remaining text is emitted too.
 */
export function segmentPages(
  pages: readonly PageText[],
  state: SegmentState,
  final: boolean,
): { passages: Passage[]; state: SegmentState } {
  const passages: Passage[] = [];
  let { ordinal, offset, section, carry } = state;

  const emit = (text: string, start: number, marks: PageMark[], sectionPath: string | null) => {
    const lead = text.length - text.trimStart().length;
    const body = text.trim();
    if (!body) return;
    const charStart = start + lead;
    const charEnd = charStart + body.length;
    const pageAt = (at: number) =>
      [...marks].reverse().find((m) => m.at <= at)?.page ?? marks[0]?.page ?? null;
    passages.push({
      ordinal: ordinal++,
      text: body,
      pageStart: pageAt(charStart),
      pageEnd: pageAt(charEnd - 1),
      charStart,
      charEnd,
      sectionPath,
    });
  };

  const flush = () => {
    if (carry) emit(carry.text, carry.start, carry.marks, carry.section);
    carry = null;
  };

  // Emits MAX-sized pieces from the front of the carry, cutting at a sentence or word boundary.
  const cutOversized = () => {
    while (carry && carry.text.trim().length > MAX_PASSAGE_CHARS) {
      const window = carry.text.slice(0, MAX_PASSAGE_CHARS);
      const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'));
      const space = Math.max(window.lastIndexOf(' '), window.lastIndexOf('\n'));
      const cut =
        sentence >= MIN_PASSAGE_CHARS
          ? sentence + 1
          : space >= MIN_PASSAGE_CHARS
            ? space
            : MAX_PASSAGE_CHARS;
      const head = carry.text.slice(0, cut);
      emit(head, carry.start, carry.marks, carry.section);
      const start = carry.start + cut;
      const lastMark = [...carry.marks].reverse().find((m) => m.at <= start) ?? carry.marks[0];
      carry = {
        text: carry.text.slice(cut),
        start,
        marks: [
          { at: start, page: lastMark?.page ?? null },
          ...carry.marks.filter((m) => m.at > start),
        ],
        section: carry.section,
      };
    }
  };

  for (const page of pages) {
    const pageStartOffset = offset === 0 ? 0 : offset + 1; // the "\n" joining pages
    if (offset !== 0) {
      if (carry) carry.text += '\n';
      offset += 1;
    }
    if (carry) carry.marks.push({ at: pageStartOffset, page: page.page });
    const lines = page.text.replace(/\r\n?/g, '\n').split('\n');
    for (const [i, line] of lines.entries()) {
      const separator = i === 0 ? '' : '\n';
      const lineStart = offset + separator.length;
      const blank = line.trim() === '';
      const heading = blank ? null : headingOf(line);
      const size = carry ? carry.text.trim().length : 0;
      if ((blank || heading) && size >= MIN_PASSAGE_CHARS) flush();
      if (heading) section = heading;
      if (!carry) {
        if (blank) {
          offset = lineStart + line.length;
          continue;
        }
        carry = {
          text: '',
          start: lineStart,
          marks: [{ at: lineStart, page: page.page }],
          section,
        };
        carry.text = line;
      } else {
        carry.text += separator + line;
      }
      offset = lineStart + line.length;
      cutOversized();
    }
  }
  if (final) flush();
  return { passages, state: { ordinal, offset, section, carry } };
}
