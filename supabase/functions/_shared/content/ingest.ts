import { IngestRequestSchema, type IngestResponse } from '../core/contracts/content.ts';
import {
  checkPageCount,
  precheckUpload,
  sha256Hex,
  type ImportErrorCode,
} from '../core/content/limits.ts';
import {
  cleanText,
  initialSegmentState,
  segmentPages,
  type PageText,
  type Passage,
  type SegmentState,
} from '../core/content/segment.ts';
import { ApiError } from '../http/errors.ts';
import { PdfOpenError, type PdfReader } from './pdf.ts';
import type { ContentStore, StoredPassage } from './store.ts';

export type IngestDeps = {
  store: ContentStore;
  pdf: PdfReader;
  /** Work budget per invocation (ADR-0001 spike): pages and elapsed milliseconds. */
  maxPages?: number;
  budgetMs?: number;
  now?: () => number;
};

type PdfCursor = { nextPage: number; pageCount: number; sha256: string; segment: SegmentState };

const hashed = (passages: Passage[]): Promise<StoredPassage[]> =>
  Promise.all(passages.map(async (p) => ({ ...p, textHash: await sha256Hex(p.text) })));

/**
 * POST /ingest-source (API_CONTRACTS §4): validates, extracts, and segments one batch, then returns.
 * The SPA calls again while `job.hasMore`; the cursor makes every batch resumable (P4-2).
 */
export async function ingestSource(
  deps: IngestDeps,
  userId: string,
  body: unknown,
): Promise<IngestResponse> {
  const parsed = IngestRequestSchema.safeParse(body);
  if (!parsed.success) throw new ApiError('validation_failed', 'jobId must be a UUID.');
  const { jobId, restart } = parsed.data;

  const claim = await deps.store.claimJob(userId, jobId, restart ?? false);
  if (!claim) throw new ApiError('not_found', 'Import job not found.');
  if (!claim.claimed) return { job: claim.job, ...(claim.busy ? { busy: true } : {}) };
  const source = claim.source;
  if (!source || claim.job.jobType === 'draft_generation') {
    throw new ApiError('validation_failed', 'This job is not an import.');
  }

  const fail = async (errorCode: ImportErrorCode, detail: string) => {
    if (source.storagePath) await deps.store.deleteUpload(source.storagePath);
    return { job: await deps.store.finishJob(userId, jobId, { errorCode, errorDetail: detail }) };
  };

  if (source.sourceType === 'user_note') {
    const { passages } = segmentPages(
      [{ page: null, text: cleanText(source.noteBodyMd ?? '') }],
      initialSegmentState(),
      true,
    );
    if (passages.length === 0) return fail('no_extractable_text', 'the note is empty');
    await deps.store.recordProgress(userId, jobId, await hashed(passages), null, 100);
    return { job: await deps.store.finishJob(userId, jobId, {}) };
  }

  if (!source.storagePath) return fail('upload_missing', 'no storage path');
  const bytes = await deps.store.downloadUpload(source.storagePath);
  if (!bytes) return fail('upload_missing', 'object not found');

  const cursor = claim.cursor as PdfCursor | null;
  let sha256 = cursor?.sha256;
  if (!cursor) {
    const early = precheckUpload({ byteSize: bytes.byteLength, head: bytes.subarray(0, 8) });
    if (early) return fail(early, `rejected before parsing (${bytes.byteLength} bytes)`);
    sha256 = await sha256Hex(bytes);
    if (sha256 !== source.sha256 && (await deps.store.shaInUse(userId, sha256, source.id))) {
      return fail('duplicate_source', 'another source has the same file');
    }
  }

  let doc;
  try {
    doc = await deps.pdf.open(bytes);
  } catch (error) {
    if (error instanceof PdfOpenError) return fail(error.code, error.message);
    return fail('pdf_corrupt', 'unreadable PDF');
  }
  const pageProblem = checkPageCount(doc.numPages);
  if (pageProblem) return fail(pageProblem, `${doc.numPages} pages`);

  const now = deps.now ?? Date.now;
  const started = now();
  const maxPages = deps.maxPages ?? 50;
  const budgetMs = deps.budgetMs ?? 1000;
  let nextPage = cursor?.nextPage ?? 1;
  const pages: PageText[] = [];
  while (
    nextPage <= doc.numPages &&
    pages.length < maxPages &&
    (pages.length === 0 || now() - started < budgetMs)
  ) {
    let text: string;
    try {
      text = await doc.pageText(nextPage);
    } catch {
      return fail('pdf_corrupt', `page ${nextPage} could not be read`);
    }
    pages.push({ page: nextPage, text: cleanText(text) });
    nextPage += 1;
  }

  const done = nextPage > doc.numPages;
  const step = segmentPages(pages, cursor?.segment ?? initialSegmentState(), done);
  const nextCursor: PdfCursor = {
    nextPage,
    pageCount: doc.numPages,
    sha256: sha256 ?? '',
    segment: step.state,
  };
  const progress = done ? 100 : Math.min(99, Math.floor(((nextPage - 1) / doc.numPages) * 100));
  const job = await deps.store.recordProgress(
    userId,
    jobId,
    await hashed(step.passages),
    nextCursor,
    progress,
    cursor ? undefined : doc.numPages,
  );
  if (!done) return { job };
  if (job.passageCount === 0) return fail('no_extractable_text', 'no text layer found');
  return { job: await deps.store.finishJob(userId, jobId, { ...(sha256 ? { sha256 } : {}) }) };
}
