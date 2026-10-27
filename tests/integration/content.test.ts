import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  GenerateResponseSchema,
  IngestResponseSchema,
  type JobView,
} from '@core/contracts/content.ts';
import { sha256Hex } from '@core/content/limits.ts';
import { createLearner, invoke, rpc, type Learner } from '../support/learners.ts';

// Content import over the real stack: Storage, ingest-source with unpdf, generate-drafts with the
// mock drafter, and publish_concept (Phase 4).
const runIntegration = Boolean(process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD);
const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/pdfs/${name}`));

async function register(learner: Learner, bytes: Uint8Array, title: string) {
  const created = await rpc<{ storagePath: string; job: JobView }>(
    learner.client,
    'create_upload_source',
    {
      title,
      byte_size: bytes.byteLength,
      sha256: await sha256Hex(bytes),
    },
  );
  const { error } = await learner.client.storage
    .from('sources')
    .upload(created.storagePath, bytes, { contentType: 'application/pdf', upsert: false });
  if (error) throw new Error(`upload: ${error.message}`);
  return created;
}

async function ingestAll(
  client: SupabaseClient,
  jobId: string,
  options: { restart?: boolean; maxCalls?: number } = {},
) {
  let response = IngestResponseSchema.parse(
    await invoke(client, 'ingest-source', { jobId, ...(options.restart ? { restart: true } : {}) }),
  );
  let calls = 1;
  while (response.job.hasMore && calls < (options.maxCalls ?? 50)) {
    response = IngestResponseSchema.parse(await invoke(client, 'ingest-source', { jobId }));
    calls += 1;
  }
  return { job: response.job, calls };
}

async function passagesOf(client: SupabaseClient, sourceId: string) {
  const { data, error } = await client
    .from('source_passages')
    .select('ordinal, page_start, page_end, char_start, char_end, text_hash, text')
    .eq('source_id', sourceId)
    .order('ordinal');
  if (error) throw error;
  return data ?? [];
}

async function practiceFixtureServiceId(client: SupabaseClient) {
  const { data } = await client
    .from('services')
    .select('id')
    .eq('slug', 'practice-fixture')
    .single();
  return (data as { id: string }).id;
}

describe.runIf(runIntegration)('content import over the API', () => {
  it('uploads, extracts, and segments a PDF with traceable passages (CNT-2, CNT-4a)', async () => {
    const learner = await createLearner();
    const created = await register(learner, fixture('valid.pdf'), 'Queues.pdf');

    const { job } = await ingestAll(learner.client, created.job.id);

    expect(job).toMatchObject({ status: 'succeeded', progressPct: 100 });
    const passages = await passagesOf(learner.client, job.sourceId ?? '');
    expect(passages.length).toBeGreaterThan(1);
    expect(
      passages.every(
        (p) => p.page_start && p.page_end && p.char_end > p.char_start && p.text_hash.length === 64,
      ),
    ).toBe(true);
    const { data: source } = await learner.client
      .from('content_sources')
      .select('status, page_count')
      .eq('id', job.sourceId ?? '')
      .single();
    expect(source).toEqual({ status: 'ready', page_count: 3 });
  });

  it.each([
    ['encrypted.pdf', 'pdf_encrypted'],
    ['corrupt.pdf', 'pdf_corrupt'],
    ['zero-pages.pdf', 'pdf_empty'],
    ['image-only.pdf', 'no_extractable_text'],
    ['renamed-exe.pdf', 'unsupported_type'],
    ['pages-301.pdf', 'pdf_too_many_pages'],
  ])('fails %s with a typed error and removes the file (CNT-8a)', async (file, code) => {
    const learner = await createLearner();
    const created = await register(learner, fixture(file), file);

    const { job } = await ingestAll(learner.client, created.job.id);

    expect(job).toMatchObject({ status: 'failed', errorCode: code });
    const { data } = await learner.client.storage.from('sources').list(learner.id);
    expect(data ?? []).toEqual([]);
  });

  it('rejects oversized uploads and other users’ folders before processing (CNT-2a)', async () => {
    const learner = await createLearner();
    const big = await learner.client.rpc('create_upload_source', {
      title: 'big.pdf',
      byte_size: 21 * 1024 * 1024,
      sha256: 'a'.repeat(64),
    });
    expect(big.error?.message).toBe('file_too_large');
    const sneaky = await learner.client.storage
      .from('sources')
      .upload(`${crypto.randomUUID()}/x.pdf`, fixture('valid.pdf'), {
        contentType: 'application/pdf',
      });
    expect(sneaky.error).not.toBeNull();
  });

  it('resumes an interrupted job from its cursor and re-runs without duplicates (P4-1, P4-2)', async () => {
    const learner = await createLearner();
    const created = await register(learner, fixture('pages-120.pdf'), 'Long.pdf');

    // One batch, then the "tab is closed": the job keeps its cursor.
    const first = await ingestAll(learner.client, created.job.id, { maxCalls: 1 });
    expect(first.job).toMatchObject({ status: 'running', hasMore: true });
    expect(first.job.progressPct).toBeLessThan(100);

    const resumed = await ingestAll(learner.client, created.job.id);
    expect(resumed.job.status).toBe('succeeded');
    expect(resumed.job.runCount).toBeGreaterThanOrEqual(3);
    const passages = await passagesOf(learner.client, created.job.sourceId ?? '');
    expect(passages.map((p) => p.ordinal)).toEqual(passages.map((_, i) => i + 1));
    expect(passages.at(-1)?.page_end).toBe(120);

    const rerun = await ingestAll(learner.client, created.job.id, { restart: true });
    expect(rerun.job.status).toBe('succeeded');
    expect(await passagesOf(learner.client, created.job.sourceId ?? '')).toHaveLength(
      passages.length,
    );
  });

  it('segments notes into passages without pages (CNT-3)', async () => {
    const learner = await createLearner();
    const created = await rpc<{ job: JobView }>(learner.client, 'create_note_source', {
      title: 'Queue notes',
      body_md:
        '# Queues\n\nQueues buffer work between producers and consumers.\n\n# Topics\n\nTopics push to subscribers.',
    });
    const { job } = await ingestAll(learner.client, created.job.id);
    expect(job.status).toBe('succeeded');
    const passages = await passagesOf(learner.client, job.sourceId ?? '');
    expect(passages.every((p) => p.page_start === null)).toBe(true);
  });

  it('drafts from passages, keeps drafts out of practice and search, and publishes after review (CNT-6, CNT-7, P4-3)', async () => {
    const owner = await createLearner(undefined, { owner: true });
    const created = await register(owner, fixture('valid.pdf'), 'Queues.pdf');
    const { job } = await ingestAll(owner.client, created.job.id);
    const passages = await rpc<{ id: string }[]>(owner.client, 'search_passages', {
      source_id: job.sourceId,
    });
    const serviceId = await practiceFixtureServiceId(owner.client);

    const generated = GenerateResponseSchema.parse(
      await invoke(owner.client, 'generate-drafts', {
        passageIds: passages.slice(0, 2).map((p) => p.id),
        serviceId,
        maxConcepts: 2,
      }),
    );
    expect(generated.job.status).toBe('succeeded');
    expect(generated.drafts).toHaveLength(2);
    const conceptId = generated.drafts[0]?.conceptId ?? '';

    const { data: concept } = await owner.client
      .from('service_concepts')
      .select('status, origin')
      .eq('id', conceptId)
      .single();
    expect(concept).toEqual({ status: 'draft', origin: 'ai_draft' });
    expect(
      (await owner.client.rpc('start_session', { scope_type: 'concept', scope_id: conceptId }))
        .error,
    ).not.toBeNull();
    const draft = await rpc<{
      title: string;
      questions: {
        id: string;
        rubric: unknown;
        promptMd: string;
        referenceAnswerMd: string;
        dimension: string;
        difficulty: number;
      }[];
    }>(owner.client, 'draft_detail', { concept_id: conceptId });
    const search = await rpc<{ items: { matchedConcepts: { id: string }[] }[] }>(
      owner.client,
      'search_catalog',
      {
        q: draft.title.split(' ')[1] ?? 'queue',
      },
    );
    expect(search.items.flatMap((i) => i.matchedConcepts.map((c) => c.id))).not.toContain(
      conceptId,
    );

    await rpc(owner.client, 'publish_concept', { concept_id: conceptId });
    expect(
      (await owner.client.rpc('start_session', { scope_type: 'concept', scope_id: conceptId }))
        .error,
    ).toBeNull();
    const revisions = await owner.client
      .from('concept_revisions')
      .select('revision')
      .eq('concept_id', conceptId);
    expect(revisions.data).toEqual([{ revision: 1 }]);
  });

  it('treats hostile passages as data and writes only the job’s drafts (CNT-9a)', async () => {
    const owner = await createLearner(undefined, { owner: true });
    const created = await register(owner, fixture('hostile.pdf'), 'Hostile.pdf');
    const { job } = await ingestAll(owner.client, created.job.id);
    const passages = await rpc<{ id: string }[]>(owner.client, 'search_passages', {
      source_id: job.sourceId,
    });
    const before = await owner.client
      .from('service_concepts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published');

    const generated = GenerateResponseSchema.parse(
      await invoke(owner.client, 'generate-drafts', {
        passageIds: passages.map((p) => p.id),
        serviceId: await practiceFixtureServiceId(owner.client),
      }),
    );

    const after = await owner.client
      .from('service_concepts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published');
    expect(after.count).toBe(before.count);
    const { data: drafts } = await owner.client
      .from('service_concepts')
      .select('id, status')
      .in(
        'id',
        generated.drafts.map((d) => d.conceptId),
      );
    expect((drafts ?? []).every((d) => d.status === 'draft')).toBe(true);
  });

  it('refuses drafting for non-owners', async () => {
    const learner = await createLearner();
    const response = await learner.client.functions.invoke('generate-drafts', {
      body: { passageIds: [crypto.randomUUID()], serviceId: crypto.randomUUID() },
    });
    expect(response.error).not.toBeNull();
  });
});
