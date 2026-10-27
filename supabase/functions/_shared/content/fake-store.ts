import type { JobView } from '../core/contracts/content.ts';
import type { DraftConcept } from '../core/content/drafts.ts';
import {
  CitationMismatchError,
  ForbiddenError,
  type Claim,
  type ClaimedSource,
  type ContentStore,
  type StoredPassage,
} from './store.ts';

type FakeJob = JobView & { userId: string; cursor: unknown; source: ClaimedSource | null };

/** In-memory ContentStore for handler tests; it records every write so tests can assert on them. */
export class FakeContentStore implements ContentStore {
  jobs = new Map<string, FakeJob>();
  objects = new Map<string, Uint8Array>();
  passages = new Map<string, StoredPassage>(); // key: textHash
  library = new Map<
    string,
    { id: string; text: string; sourceTitle: string; ownerId: string; shared: boolean }
  >();
  services = new Map([
    [
      '00000000-0000-4000-8000-00000000c0de',
      { id: '00000000-0000-4000-8000-00000000c0de', name: 'Amazon SQS' },
    ],
  ]);
  owners = new Set<string>();
  writes: string[] = [];
  createdDrafts: DraftConcept[][] = [];
  deleted: string[] = [];
  otherHashes = new Set<string>();
  private seq = 0;

  addJob(
    userId: string,
    source: ClaimedSource,
    jobType: JobView['jobType'] = 'pdf_extract',
  ): string {
    const id = `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`;
    this.jobs.set(id, {
      id,
      sourceId: source.id,
      jobType,
      status: 'queued',
      progressPct: 0,
      passageCount: 0,
      errorCode: null,
      errorDetail: null,
      hasMore: true,
      runCount: 0,
      result: null,
      createdAt: '2026-10-29T10:00:00Z',
      finishedAt: null,
      userId,
      cursor: null,
      source,
    });
    return id;
  }

  private view(job: FakeJob): JobView {
    const { userId: _u, cursor: _c, source: _s, ...view } = job;
    return { ...view, hasMore: ['queued', 'running', 'stalled'].includes(job.status) };
  }

  async claimJob(userId: string, jobId: string, restart: boolean): Promise<Claim | null> {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) return null;
    if (restart && job.status === 'succeeded')
      Object.assign(job, { status: 'queued', cursor: null, progressPct: 0, finishedAt: null });
    if (['succeeded', 'failed', 'cancelled'].includes(job.status))
      return { claimed: false, busy: false, job: this.view(job) };
    job.status = 'running';
    job.runCount += 1;
    return {
      claimed: true,
      busy: false,
      job: this.view(job),
      cursor: structuredClone(job.cursor),
      source: job.source,
    };
  }

  async recordProgress(
    userId: string,
    jobId: string,
    passages: StoredPassage[],
    cursor: unknown,
    progressPct: number,
  ) {
    this.writes.push(`progress:${jobId}`);
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId || job.status !== 'running')
      throw new Error('job is not running');
    for (const p of passages) if (!this.passages.has(p.textHash)) this.passages.set(p.textHash, p);
    Object.assign(job, {
      cursor: structuredClone(cursor),
      progressPct,
      passageCount: this.passages.size,
    });
    return this.view(job);
  }

  async finishJob(
    userId: string,
    jobId: string,
    outcome: Parameters<ContentStore['finishJob']>[2],
  ) {
    this.writes.push(`finish:${jobId}:${outcome.errorCode ?? 'ok'}`);
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) throw new Error('job not found');
    Object.assign(job, {
      status: outcome.errorCode ? 'failed' : 'succeeded',
      errorCode: outcome.errorCode ?? null,
      errorDetail: outcome.errorDetail ?? null,
      result: outcome.result ?? null,
      progressPct: outcome.errorCode ? job.progressPct : 100,
      finishedAt: '2026-10-29T10:05:00Z',
    });
    return this.view(job);
  }

  async downloadUpload(path: string) {
    return this.objects.get(path) ?? null;
  }

  async deleteUpload(path: string) {
    this.deleted.push(path);
    this.objects.delete(path);
  }

  async shaInUse(_userId: string, sha256: string) {
    return this.otherHashes.has(sha256);
  }

  async getService(serviceId: string) {
    return this.services.get(serviceId) ?? null;
  }

  async getPassages(userId: string, ids: string[]) {
    return ids.flatMap((id) => {
      const p = this.library.get(id);
      return p && (p.ownerId === userId || p.shared)
        ? [{ id: p.id, text: p.text, sourceTitle: p.sourceTitle }]
        : [];
    });
  }

  async startDraftJob(userId: string, params: unknown) {
    if (!this.owners.has(userId)) throw new ForbiddenError('not the owner');
    const id = this.addJob(
      userId,
      { id: '', sourceType: '', storagePath: null, byteSize: null, sha256: null, noteBodyMd: null },
      'draft_generation',
    );
    const job = this.jobs.get(id);
    if (!job) throw new Error('job not created');
    Object.assign(job, { sourceId: null, status: 'running', result: params });
    this.writes.push(`start:${id}`);
    return this.view(job);
  }

  async createDrafts(userId: string, jobId: string, _serviceId: string, drafts: DraftConcept[]) {
    this.writes.push(`drafts:${jobId}`);
    for (const d of drafts) {
      for (const c of d.citations) {
        const p = this.library.get(c.passageId);
        if (!p || (p.ownerId !== userId && !p.shared))
          throw new CitationMismatchError('citation_mismatch');
      }
    }
    this.createdDrafts.push(drafts);
    return drafts.map((_, i) => `00000000-0000-4000-8000-0000000d${String(i).padStart(4, '0')}`);
  }
}
