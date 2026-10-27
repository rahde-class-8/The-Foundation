import { z } from '../deps.ts';

// Edge Function request/response contracts (API_CONTRACTS §4), shared by the SPA and the functions.

export const EvaluateRequestSchema = z
  .object({ attemptId: z.uuid(), retry: z.boolean().optional() })
  .strict();
export const FinalizeRequestSchema = z
  .object({ attemptId: z.uuid(), finalEvaluationId: z.uuid() })
  .strict();

export const EVALUATION_STATUSES = [
  'completed',
  'failed',
  'invalid_response',
  'skipped_budget',
  'skipped_disabled',
] as const;

export const EvaluationViewSchema = z.object({
  id: z.uuid(),
  attemptId: z.uuid(),
  source: z.enum(['ai', 'self', 'override']),
  status: z.enum(EVALUATION_STATUSES),
  grade: z.enum(['pass', 'partial', 'miss']).nullable(),
  rubricScore: z.number().nullable(),
  confidence: z.number().nullable(),
  feedback: z.unknown().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  errorCode: z.string().nullable(),
  overridesEvaluationId: z.uuid().nullable(),
  createdAt: z.string(),
});
export type EvaluationView = z.infer<typeof EvaluationViewSchema>;

export const EvaluateResponseSchema = z.object({
  evaluation: EvaluationViewSchema,
  fallback: z.literal('self_assessment').optional(),
});
export type EvaluateResponse = z.infer<typeof EvaluateResponseSchema>;

export const FinalizeResponseSchema = z.object({
  replayed: z.boolean(),
  reviewState: z
    .object({
      conceptId: z.uuid(),
      masteryStatus: z.enum(['new', 'learning', 'reviewing', 'mastered', 'lapsed']),
      intervalDays: z.number().int(),
      dueAt: z.string().nullable(),
    })
    .nullable(),
});
export type FinalizeResponse = z.infer<typeof FinalizeResponseSchema>;

export const API_ERROR_CODES = [
  'validation_failed',
  'unauthorized',
  'not_found',
  'conflict',
  'rate_limited',
  'internal',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    requestId: z.string(),
    retryable: z.boolean(),
  }),
});
