import { z } from 'zod';
import { EvaluationViewSchema } from '@core/contracts/practice.ts';
import { DIMENSIONS } from '@core/grading/rubric.ts';

const grade = z.enum(['pass', 'partial', 'miss']);
const mastery = z.enum(['new', 'learning', 'reviewing', 'mastered', 'lapsed']);

export const SessionSchema = z.object({
  id: z.uuid(),
  scopeType: z.enum(['service', 'concept', 'domain', 'due_reviews', 'weak', 'mixed']),
  scopeId: z.uuid().nullable(),
  status: z.enum(['active', 'completed', 'abandoned']),
  startedAt: z.string(),
});

export const CandidateSchema = z.object({
  questionId: z.uuid(),
  questionVersionId: z.uuid(),
  conceptId: z.uuid(),
  conceptTitle: z.string(),
  serviceSlug: z.string(),
  serviceName: z.string(),
  promptMd: z.string(),
  dimension: z.enum(DIMENSIONS),
  difficulty: z.number().int(),
  review: z
    .object({
      masteryStatus: mastery,
      dueAt: z.string().nullable(),
      ease: z.number(),
      lapseCount: z.number().int(),
      lastColdGrade: grade.nullable(),
      totalColdAttempts: z.number().int(),
    })
    .nullable(),
  lastAnsweredAt: z.string().nullable(),
  dimensionAccuracy: z.number().nullable(),
  conceptAttemptedInSession: z.boolean(),
});

export const CandidatesSchema = z.object({
  sessionStatus: z.enum(['active', 'completed', 'abandoned']),
  endOfToday: z.string(),
  newConceptsRemaining: z.number().int(),
  candidates: z.array(CandidateSchema),
});

const SessionEvaluationSchema = EvaluationViewSchema.omit({
  attemptId: true,
  overridesEvaluationId: true,
});

export const SessionAttemptSchema = z.object({
  id: z.uuid(),
  attemptKind: z.enum(['initial', 'correction']),
  parentAttemptId: z.uuid().nullable(),
  isCold: z.boolean(),
  status: z.enum(['submitted', 'evaluated', 'finalized']),
  answerMd: z.string(),
  questionVersionId: z.uuid(),
  conceptId: z.uuid(),
  conceptTitle: z.string(),
  serviceName: z.string(),
  promptMd: z.string(),
  dimension: z.enum(DIMENSIONS),
  referenceRevealed: z.boolean(),
  finalEvaluationId: z.uuid().nullable(),
  submittedAt: z.string(),
  finalizedAt: z.string().nullable(),
  evaluations: z.array(SessionEvaluationSchema),
  nextDueAt: z.string().nullable(),
});

export const SessionStateSchema = SessionSchema.extend({
  endedAt: z.string().nullable(),
  attempts: z.array(SessionAttemptSchema),
});

export const AttemptSchema = z.object({
  id: z.uuid(),
  status: z.enum(['submitted', 'evaluated', 'finalized']),
  isCold: z.boolean(),
  attemptKind: z.enum(['initial', 'correction']),
  parentAttemptId: z.uuid().nullable(),
  conceptId: z.uuid(),
  questionVersionId: z.uuid(),
  submittedAt: z.string(),
});

export const ReferenceSchema = z.object({
  referenceAnswerMd: z.string(),
  rubric: z.object({
    points: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        weight: z.number().int(),
        critical: z.boolean(),
      }),
    ),
    knownMisconceptions: z.array(
      z.object({ slug: z.string(), statement: z.string(), correction: z.string() }),
    ),
    thresholds: z.object({ pass: z.number(), partial: z.number() }),
  }),
});

export const SummarySchema = z.object({
  finalized: z.number().int(),
  pass: z.number().int(),
  partial: z.number().int(),
  miss: z.number().int(),
  cold: z.number().int(),
  toReview: z.array(z.object({ conceptId: z.uuid(), title: z.string() })),
});

export type Session = z.infer<typeof SessionSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type Candidates = z.infer<typeof CandidatesSchema>;
export type SessionState = z.infer<typeof SessionStateSchema>;
export type SessionAttempt = z.infer<typeof SessionAttemptSchema>;
export type Attempt = z.infer<typeof AttemptSchema>;
export type Reference = z.infer<typeof ReferenceSchema>;
export type Summary = z.infer<typeof SummarySchema>;
export type Grade = z.infer<typeof grade>;

export const ScopesSchema = z.object({
  services: z.array(
    z.object({ id: z.uuid(), slug: z.string(), name: z.string(), questionCount: z.number().int() }),
  ),
  domains: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      name: z.string(),
      certification: z.string(),
      questionCount: z.number().int(),
    }),
  ),
  dueCount: z.number().int(),
  weakCount: z.number().int(),
  totalQuestions: z.number().int(),
});
export type Scopes = z.infer<typeof ScopesSchema>;
