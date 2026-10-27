import type { EvaluationView } from '../core/contracts/practice.ts';
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
  finalizeAttempt(input: {
    userId: string;
    attemptId: string;
    finalEvaluationId: string;
    expectedVersion: number;
    transition: ReviewSnapshot | null;
    configVersion: string | null;
  }): Promise<FinalizeResult>;
}
