import {
  GenerateResponseSchema,
  IngestResponseSchema,
  type JobView,
} from '@core/contracts/content.ts';
import { sha256Hex } from '@core/content/limits.ts';
import { getEnv } from '@/lib/env';
import { invokeFunction } from '@/lib/functions';
import type { Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { rpcErrorMessage } from '../model/upload';
import {
  DraftSchema,
  FacetsSchema,
  OverviewSchema,
  PassagesSchema,
  type DraftQuestion,
} from './schemas';

function unwrap<T>(context: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${context}: ${rpcErrorMessage(result.error.message)}`);
  return result.data;
}

export async function getOverview() {
  return OverviewSchema.parse(
    unwrap('Could not load your content', await supabase.rpc('content_overview')),
  );
}

export async function searchPassages(q: string, sourceId?: string) {
  return PassagesSchema.parse(
    unwrap(
      'Could not search passages',
      await supabase.rpc('search_passages', {
        ...(q ? { q } : {}),
        ...(sourceId ? { source_id: sourceId } : {}),
      }),
    ),
  );
}

export async function listServices(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('services')
    .select('id, name')
    .neq('status', 'retired')
    .order('name');
  if (error) throw new Error(`Could not load services: ${error.message}`);
  return data ?? [];
}

export async function getDomains() {
  const facets = FacetsSchema.parse(
    unwrap('Could not load exam domains', await supabase.rpc('catalog_facets')),
  );
  return facets.certifications.flatMap((c) =>
    c.domains.map((d) => ({ ...d, certification: c.code })),
  );
}

/** Uploads to Storage with progress events (supabase-js has none), using the user's session. */
function putObject(
  path: string,
  file: File,
  onProgress: (pct: number) => void,
  token: string,
): Promise<void> {
  const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = getEnv();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${VITE_SUPABASE_URL}/storage/v1/object/sources/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', VITE_SUPABASE_ANON_KEY);
    xhr.setRequestHeader('Content-Type', 'application/pdf');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`));
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.send(file);
  });
}

/** Registers the upload (limits and duplicates are checked first), then sends the file. */
export async function uploadPdf(
  file: File,
  title: string,
  onProgress: (pct: number) => void,
): Promise<JobView> {
  const sha256 = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
  const created = unwrap(
    'Could not start the upload',
    await supabase.rpc('create_upload_source', { title, byte_size: file.size, sha256 }),
  ) as { storagePath: string; job: unknown };
  const { data } = await supabase.auth.getSession();
  await putObject(created.storagePath, file, onProgress, data.session?.access_token ?? '');
  return IngestResponseSchema.shape.job.parse(created.job);
}

export async function createNote(title: string, body: string): Promise<JobView> {
  const created = unwrap(
    'Could not save the note',
    await supabase.rpc('create_note_source', { title, body_md: body }),
  ) as { job: unknown };
  return IngestResponseSchema.shape.job.parse(created.job);
}

export function ingest(jobId: string, restart = false) {
  return invokeFunction(
    'ingest-source',
    { jobId, ...(restart ? { restart } : {}) },
    IngestResponseSchema,
  );
}

export function generateDrafts(input: {
  passageIds: string[];
  serviceId: string;
  maxConcepts: number;
}) {
  return invokeFunction('generate-drafts', input, GenerateResponseSchema);
}

export async function getDraft(id: string) {
  return DraftSchema.parse(
    unwrap('Could not load the draft', await supabase.rpc('draft_detail', { concept_id: id })),
  );
}

export type DraftEdits = {
  title: string;
  summaryMd: string;
  explanationMd: string;
  limitationsMd: string;
  domainIds: string[];
  questions: Pick<
    DraftQuestion,
    'id' | 'dimension' | 'difficulty' | 'promptMd' | 'referenceAnswerMd' | 'rubric'
  >[];
};

export async function saveDraft(id: string, edits: DraftEdits) {
  return DraftSchema.parse(
    unwrap(
      'Could not save the draft',
      await supabase.rpc('update_draft', {
        concept_id: id,
        title: edits.title,
        summary_md: edits.summaryMd,
        explanation_md: edits.explanationMd,
        limitations_md: edits.limitationsMd,
        domain_ids: edits.domainIds,
        questions: edits.questions as unknown as Json,
      }),
    ),
  );
}

export async function publishDraft(id: string) {
  return unwrap('Could not publish', await supabase.rpc('publish_concept', { concept_id: id }));
}

export async function rejectDraft(id: string) {
  return unwrap(
    'Could not reject the draft',
    await supabase.rpc('reject_draft', { concept_id: id }),
  );
}
