import type { SupabaseClient } from '@supabase/supabase-js';
import { JobViewSchema } from '../core/contracts/content.ts';
import {
  CitationMismatchError,
  ForbiddenError,
  type Claim,
  type ContentStore,
} from '../content/store.ts';

function check<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new Error(`database: ${result.error.message}`);
  return result.data;
}

/** ContentStore backed by the service-role client; every call is scoped to the authenticated user. */
export function createContentStore(db: SupabaseClient): ContentStore {
  return {
    async claimJob(userId, jobId, restart) {
      const { data, error } = await db.rpc('claim_import_job', {
        p_user_id: userId,
        p_job_id: jobId,
        p_restart: restart,
      });
      if (error?.code === 'P0002') return null;
      if (error) throw new Error(`database: ${error.message}`);
      const raw = data as {
        claimed: boolean;
        busy: boolean;
        job: unknown;
        cursor?: unknown;
        source?: unknown;
      };
      const job = JobViewSchema.parse(raw.job);
      return raw.claimed
        ? ({
            claimed: true,
            busy: false,
            job,
            cursor: raw.cursor ?? null,
            source: (raw.source ?? null) as never,
          } as Claim)
        : { claimed: false, busy: raw.busy, job };
    },

    async recordProgress(userId, jobId, passages, cursor, progressPct, pageCount) {
      const data = check(
        await db.rpc('record_import_progress', {
          p_user_id: userId,
          p_job_id: jobId,
          p_passages: passages,
          p_cursor: cursor,
          p_progress: progressPct,
          p_page_count: pageCount ?? null,
        }),
      );
      return JobViewSchema.parse(data);
    },

    async finishJob(userId, jobId, outcome) {
      const data = check(
        await db.rpc('finish_import_job', {
          p_user_id: userId,
          p_job_id: jobId,
          p_error_code: outcome.errorCode ?? null,
          p_error_detail: outcome.errorDetail ?? null,
          p_result: outcome.result ?? null,
          p_sha256: outcome.sha256 ?? null,
        }),
      );
      return JobViewSchema.parse(data);
    },

    async downloadUpload(storagePath) {
      const { data, error } = await db.storage.from('sources').download(storagePath);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },

    async deleteUpload(storagePath) {
      await db.storage.from('sources').remove([storagePath]);
    },

    async shaInUse(userId, sha256, exceptSourceId) {
      const rows = check(
        await db
          .from('content_sources')
          .select('id')
          .eq('owner_id', userId)
          .eq('sha256', sha256)
          .neq('id', exceptSourceId)
          .neq('status', 'failed'),
      ) as unknown[];
      return rows.length > 0;
    },

    async getService(serviceId) {
      const row = check(
        await db
          .from('services')
          .select('id, name')
          .eq('id', serviceId)
          .neq('status', 'retired')
          .maybeSingle(),
      ) as { id: string; name: string } | null;
      return row;
    },

    async getPassages(userId, ids) {
      // Two queries rather than an embed: the citation rule (own or shared source) is checked here.
      const passages = check(
        await db.from('source_passages').select('id, text, source_id').in('id', ids),
      ) as { id: string; text: string; source_id: string }[];
      const sourceIds = [...new Set(passages.map((p) => p.source_id))];
      const sources = check(
        await db
          .from('content_sources')
          .select('id, title, owner_id, visibility')
          .in('id', sourceIds),
      ) as { id: string; title: string; owner_id: string; visibility: string }[];
      const allowed = new Map(
        sources
          .filter((s) => s.owner_id === userId || s.visibility === 'shared')
          .map((s) => [s.id, s.title]),
      );
      const byId = new Map(passages.filter((p) => allowed.has(p.source_id)).map((p) => [p.id, p]));
      return ids.flatMap((id) => {
        const p = byId.get(id);
        return p ? [{ id: p.id, text: p.text, sourceTitle: allowed.get(p.source_id) ?? '' }] : [];
      });
    },

    async startDraftJob(userId, params) {
      const { data, error } = await db.rpc('start_draft_job', {
        p_user_id: userId,
        p_params: params,
      });
      if (error?.code === '42501') throw new ForbiddenError(error.message);
      if (error) throw new Error(`database: ${error.message}`);
      return JobViewSchema.parse(data);
    },

    async createDrafts(userId, jobId, serviceId, drafts) {
      const { data, error } = await db.rpc('create_drafts', {
        p_user_id: userId,
        p_job_id: jobId,
        p_service_id: serviceId,
        p_drafts: drafts,
      });
      if (error?.message === 'citation_mismatch') throw new CitationMismatchError(error.message);
      if (error) throw new Error(`database: ${error.message}`);
      return (data as { conceptIds: string[] }).conceptIds;
    },
  };
}
