import type { EvaluationView } from '../core/contracts/practice.ts';
import type { ExistingMisconception, MisconceptionMatch } from '../core/misconceptions/match.ts';
import type { EvaluationResult } from '../core/grading/evaluation.ts';
import type { Dimension } from '../core/grading/rubric.ts';
import type { ReviewSnapshot } from '../core/scheduler/next.ts';

export type AttemptContext = {
  attempt: {
    id: string;
    status: 'submitted' | 'evaluated' | 'finalized';
    attemptKind: 'initial' | 'correction';
    parentAttemptId: string | null;
    isCold: boolean;
    answerMd: string;
    conceptId: string;
  };
  question: { promptMd: string; referenceAnswerMd: string; rubric: unknown; dimension: Dimension };
  conceptTitle: string;
  evaluations: EvaluationView[];
  /** For corrections: the parent attempt's evaluations, to find the correction targets. */
  parentEvaluations: EvaluationView[];
  settings: { timezone: string; aiGradingEnabled: boolean; schedulerOverrides: unknown };
};

export type AiEvaluationRecord = {
  status: 'completed' | 'failed' | 'invalid_response' | 'skipped_budget' | 'skipped_disabled';
  grade?: 'pass' | 'partial' | 'miss';
  rubricScore?: number;
  confidence?: number;
  feedback?: EvaluationResult;
  provider?: string;
  model?: string;
  promptVersion?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  errorCode?: string;
  rawResponseExcerpt?: string;
};

export type StoredReviewState = ReviewSnapshot & { version: number };

export type FinalizeResult = {
  replayed: boolean;
  state: (StoredReviewState & { conceptId: string }) | null;
};

export class VersionConflictError extends Error {}
export class NotFoundError extends Error {}

export type LearnerSettings = { timezone: string; schedulerOverrides: unknown };

/** What finalize needs to record and resolve misconceptions for one concept. */
export type MisconceptionContext = {
  existing: (ExistingMisconception & { lastSeenAt: string })[];
  /** occurred_at of every cold Pass review event on the concept. */
  coldPassTimes: string[];
};

export type MisconceptionChanges = { record: MisconceptionMatch[]; resolve: string[] };

/** Data access for the practice Edge Functions (implemented with the service-role client). */
export interface PracticeStore {
  getAttemptContext(userId: string, attemptId: string): Promise<AttemptContext | null>;
  aiUsageSince(userId: string, since: Date): Promise<{ count: number; costUsd: number }>;
  recordAiEvaluation(
    userId: string,
    attemptId: string,
    record: AiEvaluationRecord,
  ): Promise<EvaluationView>;
  getReviewState(userId: string, conceptId: string): Promise<StoredReviewState | null>;
  /** The learner's current time on the database clock (the test clock in local stacks). */
  serverNow(userId: string): Promise<Date>;
  getSettings(userId: string): Promise<LearnerSettings>;
  getMisconceptionContext(userId: string, conceptId: string): Promise<MisconceptionContext>;
  finalizeAttempt(input: {
    userId: string;
    attemptId: string;
    finalEvaluationId: string;
    expectedVersion: number;
    transition: ReviewSnapshot | null;
    configVersion: string | null;
    misconceptions: MisconceptionChanges | null;
  }): Promise<FinalizeResult>;
  /** Throws NotFoundError when the concept has no schedule, VersionConflictError on a stale version. */
  applyOverride(input: {
    userId: string;
    conceptId: string;
    dueAt: string;
    reason: string;
    clientKey: string;
    expectedVersion: number;
  }): Promise<{
    replayed: boolean;
    state: StoredReviewState & { conceptId: string };
    eventId: string;
  }>;
}
