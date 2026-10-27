import { z } from 'zod';

const status = z.enum(['new', 'learning', 'reviewing', 'mastered', 'lapsed']);
const grade = z.enum(['pass', 'partial', 'miss']);
const num = z.coerce.number();

export const DUE_WINDOWS = ['today', 'overdue', 'upcoming'] as const;
export type DueWindow = (typeof DUE_WINDOWS)[number];

export const DueReviewSchema = z.object({
  conceptId: z.string(),
  conceptTitle: z.string(),
  serviceSlug: z.string(),
  serviceName: z.string(),
  masteryStatus: status,
  dueAt: z.string(),
  intervalDays: z.number(),
  ease: num,
  lastColdGrade: grade.nullable(),
  lapseCount: z.number(),
  lastReviewedAt: z.string().nullable(),
  manualDueOverride: z.boolean(),
  activeMisconceptions: z.number(),
  priority: num,
  version: z.number(),
});
export type DueReview = z.infer<typeof DueReviewSchema>;

export const DueReviewsSchema = z.object({
  now: z.string(),
  timezone: z.string(),
  today: z.string(),
  counts: z.object({ today: z.number(), overdue: z.number(), upcoming: z.number() }),
  items: z.array(DueReviewSchema),
});
export type DueReviews = z.infer<typeof DueReviewsSchema>;

export const HistorySchema = z.object({
  concept: z.object({
    id: z.string(),
    title: z.string(),
    serviceSlug: z.string(),
    serviceName: z.string(),
  }),
  state: z
    .object({
      masteryStatus: status,
      intervalDays: z.number(),
      ease: num,
      dueAt: z.string().nullable(),
      lapseCount: z.number(),
    })
    .nullable(),
  events: z.array(
    z.object({
      id: z.string(),
      eventType: z.enum(['initialized', 'graded', 'manual_override', 'reset']),
      occurredAt: z.string(),
      attemptId: z.string().nullable(),
      grade: grade.nullable(),
      isCold: z.boolean().nullable(),
      prevDueAt: z.string().nullable(),
      newDueAt: z.string().nullable(),
      prevIntervalDays: z.number().nullable(),
      newIntervalDays: z.number().nullable(),
      prevStatus: z.string().nullable(),
      newStatus: z.string().nullable(),
      reason: z.string().nullable(),
    }),
  ),
  attempts: z.array(
    z.object({
      id: z.string(),
      attemptKind: z.enum(['initial', 'correction']),
      isCold: z.boolean(),
      status: z.string(),
      submittedAt: z.string(),
      finalizedAt: z.string().nullable(),
      grade: grade.nullable(),
      gradeSource: z.enum(['ai', 'self', 'override']).nullable(),
      dimension: z.string(),
      questionVersion: z.number(),
    }),
  ),
  misconceptions: z.array(
    z.object({
      id: z.string(),
      statementMd: z.string(),
      correctionMd: z.string().nullable(),
      status: z.enum(['active', 'resolved']),
      occurrenceCount: z.number(),
    }),
  ),
});
export type History = z.infer<typeof HistorySchema>;

export const MisconceptionsSchema = z.array(
  z.object({
    id: z.string(),
    slug: z.string(),
    statementMd: z.string(),
    correctionMd: z.string().nullable(),
    occurrenceCount: z.number(),
    recurring: z.boolean(),
    lastSeenAt: z.string(),
    concept: z.object({
      id: z.string(),
      title: z.string(),
      serviceSlug: z.string(),
      serviceName: z.string(),
    }),
  }),
);
export type Misconception = z.infer<typeof MisconceptionsSchema>[number];
