import type { DraftOutput } from '../core/content/drafts.ts';
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

export type ProviderResult<T = EvaluationOutput> =
  | { ok: true; value: T; usage: TokenUsage; model: string; rawExcerpt: string }
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

export type DraftRequest = {
  serviceName: string;
  /** Passages as untrusted data, cited back by alias (P1, P2, …). */
  passages: { alias: string; sourceTitle: string; text: string }[];
  maxConcepts: number;
};

/** A drafting backend for generate-drafts (CONTENT_GOVERNANCE §5–§6). The model gets no tools. */
export interface DraftProvider {
  readonly id: string;
  readonly model: string;
  generateDrafts(
    request: DraftRequest,
    options: { signal: AbortSignal; timeoutMs: number },
  ): Promise<ProviderResult<DraftOutput>>;
  costUsd(usage: TokenUsage): number;
}
