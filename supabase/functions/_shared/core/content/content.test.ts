import { checkPageCount, hasPdfMagic, precheckUpload, sha256Hex } from './limits.ts';
import {
  MAX_PASSAGE_CHARS,
  headingOf,
  initialSegmentState,
  segmentPages,
  type PageText,
  type Passage,
} from './segment.ts';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('upload checks (CNT-2a)', () => {
  it('accepts PDFs by magic bytes only', () => {
    expect(hasPdfMagic(bytes('%PDF-1.7\n...'))).toBe(true);
    expect(hasPdfMagic(bytes('MZ\x90\x00'))).toBe(false);
    expect(hasPdfMagic(bytes(' %PDF-1.7'))).toBe(false);
    expect(precheckUpload({ byteSize: 1000, head: bytes('MZ') })).toBe('unsupported_type');
    expect(precheckUpload({ byteSize: 21 * 1024 * 1024, head: bytes('%PDF-') })).toBe(
      'file_too_large',
    );
    expect(precheckUpload({ byteSize: 1000, head: bytes('%PDF-1.4') })).toBeNull();
  });

  it('limits page counts', () => {
    expect(checkPageCount(0)).toBe('pdf_empty');
    expect(checkPageCount(300)).toBeNull();
    expect(checkPageCount(301)).toBe('pdf_too_many_pages');
  });

  it('hashes like sha256sum', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

const sentence = (n: number) => `Sentence ${n} explains how a queue buffers work between services.`;
const paragraph = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => sentence(from + i)).join(' ');

function sourceText(pages: readonly PageText[]) {
  return pages.map((p) => p.text.replace(/\r\n?/g, '\n')).join('\n');
}

function expectTraceable(pages: readonly PageText[], passages: Passage[]) {
  const source = sourceText(pages);
  for (const p of passages) {
    expect(source.slice(p.charStart, p.charEnd)).toBe(p.text);
    expect(p.text.length).toBeLessThanOrEqual(MAX_PASSAGE_CHARS);
    expect(p.text.length).toBeGreaterThan(0);
  }
  expect(passages.map((p) => p.ordinal)).toEqual(passages.map((_, i) => i + 1));
}

describe('segmentation (CNT-4)', () => {
  it('detects headings', () => {
    expect(headingOf('## Visibility timeout')).toBe('Visibility timeout');
    expect(headingOf('Dead-letter queues')).toBe('Dead-letter queues');
    expect(headingOf('This is a sentence that ends with a period.')).toBeNull();
    expect(headingOf('lowercase start')).toBeNull();
  });

  it('keeps passages within limits with exact offsets and page ranges', () => {
    const pages: PageText[] = [
      { page: 1, text: `Queues\n${paragraph(1, 12)}\n\nVisibility\n${paragraph(20, 10)}` },
      { page: 2, text: `${paragraph(40, 30)}` },
      { page: 3, text: `Topics\n${paragraph(80, 8)}` },
    ];
    const { passages } = segmentPages(pages, initialSegmentState(), true);
    expectTraceable(pages, passages);
    expect(passages[0]).toMatchObject({ pageStart: 1, sectionPath: 'Queues' });
    expect(passages.some((p) => p.pageStart === 1 && p.pageEnd === 2)).toBe(true);
    expect(passages.at(-1)).toMatchObject({ pageEnd: 3, sectionPath: 'Topics' });
    // Long runs are cut at sentence boundaries.
    expect(passages.filter((p) => p.text.length > 600).every((p) => p.text.endsWith('.'))).toBe(
      true,
    );
  });

  it('gives the same passages whether pages arrive at once or in batches (resumable)', () => {
    const pages: PageText[] = Array.from({ length: 9 }, (_, i) => ({
      page: i + 1,
      text: i % 3 === 0 ? `Section ${i}\n${paragraph(i * 10, 7)}` : paragraph(i * 10, 4 + i),
    }));
    const once = segmentPages(pages, initialSegmentState(), true).passages;

    let state = initialSegmentState();
    const batched: Passage[] = [];
    for (let i = 0; i < pages.length; i += 2) {
      const step = segmentPages(
        pages.slice(i, i + 2),
        JSON.parse(JSON.stringify(state)),
        i + 2 >= pages.length,
      );
      batched.push(...step.passages);
      state = step.state;
    }
    expect(batched).toEqual(once);
    expectTraceable(pages, once);
  });

  it('splits notes on markdown headings and blank lines, without page numbers', () => {
    const note = `# Queues\n\n${paragraph(1, 10)}\n\n# Topics\n\n${paragraph(30, 10)}`;
    const { passages } = segmentPages([{ page: null, text: note }], initialSegmentState(), true);
    expect(passages.map((p) => p.sectionPath)).toEqual(['Queues', 'Topics']);
    expect(passages.every((p) => p.pageStart === null && p.pageEnd === null)).toBe(true);
    expectTraceable([{ page: null, text: note }], passages);
  });

  it('hard-cuts text without spaces and skips empty pages', () => {
    const pages: PageText[] = [
      { page: 1, text: 'x'.repeat(4500) },
      { page: 2, text: '   \n\n' },
    ];
    const { passages } = segmentPages(pages, initialSegmentState(), true);
    expect(passages.map((p) => p.text.length)).toEqual([2000, 2000, 500]);
    expect(segmentPages([{ page: 1, text: '' }], initialSegmentState(), true).passages).toEqual([]);
  });
});
