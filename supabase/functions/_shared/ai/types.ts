import type { EvaluationOutput } from '../core/grading/evaluation.ts';
import type { Dimension, RubricV1 } from '../core/grading/rubric.ts';

export type EvaluationRequest = {
  conceptTitle: string;
  dimension: Dimension;
  promptMd: string;
  referenceAnswerMd: string;
  rubric: RubricV1;
  answer: string;
  /** Corrections are graded against the targeted points only (GRADING_RUBRICS §9). */
  mode: 'initial' | 'correction';
};

export type ProviderErrorCode =
  'timeout' | 'rate_limited' | 'provider_error' | 'invalid_response' | 'refused';

export type TokenUsage = { inputTokens: number; outputTokens: number };

export type ProviderResult =
  | { ok: true; value: EvaluationOutput; usage: TokenUsage; model: string; rawExcerpt: string }
  | {
      ok: false;
      error: ProviderErrorCode;
      retryable: boolean;
      message: string;
      rawExcerpt?: string;
    };

/** A grading backend. Adapters translate transport only; the core owns schemas and grade rules (ADR-0004). */
export interface EvaluationProvider {
  readonly id: string;
  readonly model: string;
  evaluate(
    request: EvaluationRequest,
    options: { signal: AbortSignal; timeoutMs: number },
  ): Promise<ProviderResult>;
  /** Estimated cost in USD for the given usage. */
  costUsd(usage: TokenUsage): number;
}
