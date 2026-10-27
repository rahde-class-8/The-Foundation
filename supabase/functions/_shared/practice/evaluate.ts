import type { AiConfig } from '../ai/config.ts';
import { evaluateWithPolicy } from '../ai/policy.ts';
import { PROMPT_VERSION } from '../ai/prompts/grading/v1.ts';
import type { EvaluationProvider } from '../ai/types.ts';
import {
  EvaluateRequestSchema,
  type EvaluateResponse,
  type EvaluationView,
} from '../core/contracts/practice.ts';
import { correctionRubric, planCorrection } from '../core/correction/plan.ts';
import { gradeEvaluation } from '../core/grading/derive.ts';
import { EvaluationResultSchema, normalizeEvaluation } from '../core/grading/evaluation.ts';
import { selectFinalEvaluation } from '../core/grading/final.ts';
import { RubricV1Schema, type RubricV1 } from '../core/grading/rubric.ts';
import { ApiError } from '../http/errors.ts';
import type { PracticeStore } from './store.ts';

export type EvaluateDeps = {
  store: PracticeStore;
  provider: EvaluationProvider | null;
  config: AiConfig;
  now: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

const HOUR_MS = 3_600_000;

/**
 * POST /evaluate-attempt (API_CONTRACTS §4). The answer is already persisted, so every failure path
 * records an evaluation row and returns `fallback: 'self_assessment'` instead of an error (REC-5).
 */
export async function evaluateAttempt(
  deps: EvaluateDeps,
  userId: string,
  body: unknown,
): Promise<EvaluateResponse> {
  const parsed = EvaluateRequestSchema.safeParse(body);
  if (!parsed.success) throw new ApiError('validation_failed', 'attemptId must be a UUID.');
  const { attemptId, retry } = parsed.data;

  const context = await deps.store.getAttemptContext(userId, attemptId);
  if (!context) throw new ApiError('not_found', 'Attempt not found.');
  if (context.attempt.status === 'finalized')
    throw new ApiError('conflict', 'This attempt is already finalized.');

  // A repeated call returns the completed AI grade instead of paying for a second one.
  const existing = context.evaluations
    .filter((e) => e.source === 'ai' && e.status === 'completed')
    .at(-1);
  if (existing && !retry) return { evaluation: existing };

  const fail = async (
    record: Parameters<PracticeStore['recordAiEvaluation']>[2],
  ): Promise<EvaluateResponse> => ({
    evaluation: await deps.store.recordAiEvaluation(userId, attemptId, record),
    fallback: 'self_assessment',
  });

  if (!deps.provider || !context.settings.aiGradingEnabled) {
    return fail({
      status: 'skipped_disabled',
      errorCode: deps.provider ? 'disabled_by_learner' : 'not_configured',
    });
  }

  const now = deps.now();
  const hourly = await deps.store.aiUsageSince(userId, new Date(now.getTime() - HOUR_MS));
  if (hourly.count >= deps.config.rateLimitPerHour) {
    throw new ApiError(
      'rate_limited',
      'Too many AI evaluations in the last hour. Grade this one yourself.',
      true,
    );
  }
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthly = await deps.store.aiUsageSince(userId, monthStart);
  if (monthly.costUsd >= deps.config.monthlyBudgetUsd) {
    return fail({
      status: 'skipped_budget',
      provider: deps.provider.id,
      errorCode: 'monthly_budget_reached',
    });
  }

  const rubricResult = RubricV1Schema.safeParse(context.question.rubric);
  if (!rubricResult.success) throw new ApiError('internal', 'This question has an invalid rubric.');
  let rubric = rubricResult.data;
  let mode: 'initial' | 'correction' = 'initial';
  if (context.attempt.attemptKind === 'correction') {
    mode = 'correction';
    rubric = correctionRubric(rubric, correctionTargets(rubric, context.parentEvaluations));
  }

  const { result, latencyMs } = await evaluateWithPolicy(
    deps.provider,
    {
      conceptTitle: context.conceptTitle,
      dimension: context.question.dimension,
      promptMd: context.question.promptMd,
      referenceAnswerMd: context.question.referenceAnswerMd,
      rubric,
      answer: context.attempt.answerMd,
      mode,
    },
    {
      timeoutMs: deps.config.timeoutMs,
      deadlineMs: deps.config.deadlineMs,
      maxRetries: deps.config.maxRetries,
      ...(deps.sleep ? { sleep: deps.sleep } : {}),
      now: () => deps.now().getTime(),
    },
  );

  const meta = {
    provider: deps.provider.id,
    model: deps.provider.model,
    promptVersion: PROMPT_VERSION,
    latencyMs,
  };
  if (!result.ok) {
    return fail({
      ...meta,
      status: result.error === 'invalid_response' ? 'invalid_response' : 'failed',
      errorCode: result.error,
      ...(result.rawExcerpt ? { rawResponseExcerpt: result.rawExcerpt } : {}),
    });
  }

  const feedback = normalizeEvaluation(result.value, rubric, context.attempt.answerMd);
  const { grade, rubricScore, confidence } = gradeEvaluation(rubric, feedback);
  const evaluation = await deps.store.recordAiEvaluation(userId, attemptId, {
    ...meta,
    model: result.model,
    status: 'completed',
    grade,
    rubricScore,
    confidence,
    feedback,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    costUsd: deps.provider.costUsd(result.usage),
    rawResponseExcerpt: result.rawExcerpt,
  });
  return { evaluation };
}

/** Points to grade in a correction: what the parent's final (or latest AI) evaluation found lacking. */
export function correctionTargets(rubric: RubricV1, parentEvaluations: EvaluationView[]): string[] {
  const aiFeedback = parentEvaluations
    .filter((e) => e.source === 'ai' && e.status === 'completed')
    .map((e) => EvaluationResultSchema.safeParse(e.feedback))
    .filter((r) => r.success)
    .at(-1);
  if (aiFeedback?.success) {
    const verdicts = Object.fromEntries(
      aiFeedback.data.pointJudgements.map((j) => [j.pointId, j.verdict]),
    );
    return planCorrection(rubric, verdicts).targetPointIds;
  }
  const self = selectFinalEvaluation(parentEvaluations.filter((e) => e.source !== 'ai'));
  const ticks =
    (self?.feedback as { ticks?: Record<string, 'covered' | 'partial' | 'missing'> } | null)
      ?.ticks ?? {};
  return planCorrection(rubric, ticks).targetPointIds;
}
