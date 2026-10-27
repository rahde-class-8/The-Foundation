import { z } from '../deps.ts';
import { MAX_DRAFT_CONCEPTS, MAX_DRAFT_PASSAGES } from '../content/drafts.ts';
import { IMPORT_ERROR_CODES } from '../content/limits.ts';

// Content import contracts (API_CONTRACTS §4): POST /ingest-source and POST /generate-drafts.

export const JobViewSchema = z.object({
  id: z.uuid(),
  sourceId: z.uuid().nullable(),
  jobType: z.enum(['pdf_extract', 'note_segment', 'draft_generation']),
  status: z.enum(['queued', 'running', 'stalled', 'succeeded', 'failed', 'cancelled']),
  progressPct: z.number(),
  passageCount: z.number(),
  errorCode: z.enum(IMPORT_ERROR_CODES).nullable(),
  errorDetail: z.string().nullable(),
  /** True while the SPA should invoke ingest-source again. */
  hasMore: z.boolean(),
  runCount: z.number(),
  result: z.unknown().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type JobView = z.infer<typeof JobViewSchema>;

export const IngestRequestSchema = z
  .object({ jobId: z.uuid(), restart: z.boolean().optional() })
  .strict();
export const IngestResponseSchema = z.object({ job: JobViewSchema, busy: z.boolean().optional() });
export type IngestResponse = z.infer<typeof IngestResponseSchema>;

export const GenerateRequestSchema = z
  .object({
    passageIds: z.array(z.uuid()).min(1).max(MAX_DRAFT_PASSAGES),
    serviceId: z.uuid(),
    maxConcepts: z.number().int().min(1).max(MAX_DRAFT_CONCEPTS).optional(),
  })
  .strict();
export const GenerateResponseSchema = z.object({
  job: JobViewSchema,
  drafts: z.array(z.object({ conceptId: z.uuid(), title: z.string(), questionCount: z.number() })),
  rejected: z.array(z.object({ title: z.string(), reason: z.string() })),
});
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
