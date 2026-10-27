import { FinalizeRequestSchema, type FinalizeResponse } from '../core/contracts/practice.ts';
import { EvaluationResultSchema } from '../core/grading/evaluation.ts';
import { selectFinalEvaluation } from '../core/grading/final.ts';
import { RubricV1Schema } from '../core/grading/rubric.ts';
import { matchMisconceptions, shouldResolve } from '../core/misconceptions/match.ts';
import { resolveConfig } from '../core/scheduler/config.ts';
import { initialSnapshot, next, type ReviewSnapshot } from '../core/scheduler/next.ts';
import { ApiError } from '../http/errors.ts';
import {
  VersionConflictError,
  type AttemptContext,
  type FinalizeResult,
  type MisconceptionChanges,
  type PracticeStore,
} from './store.ts';

export type FinalizeDeps = { store: PracticeStore };

/**
 * POST /finalize-attempt (API_CONTRACTS §4): freezes the grade and schedules the concept once.
 * The core computes the transition; Postgres applies it atomically and idempotently (ADR-0003).
 */
export async function finalizeAttempt(
  deps: FinalizeDeps,
  userId: string,
  body: unknown,
): Promise<FinalizeResponse> {
  const parsed = FinalizeRequestSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError('validation_failed', 'attemptId and finalEvaluationId must be UUIDs.');
  const { attemptId, finalEvaluationId } = parsed.data;

  for (let round = 0; round < 2; round += 1) {
    const context = await deps.store.getAttemptContext(userId, attemptId);
    if (!context) throw new ApiError('not_found', 'Attempt not found.');

    if (context.attempt.status !== 'finalized') {
      const expected = selectFinalEvaluation(context.evaluations);
      if (!expected) throw new ApiError('conflict', 'Grade the answer before finalizing.');
      if (expected.id !== finalEvaluationId) {
        throw new ApiError(
          'conflict',
          'Finalize with the latest grade (your own grade wins over the AI grade).',
        );
      }
    }

    const isInitial = context.attempt.attemptKind === 'initial';
    const grade = context.evaluations.find((e) => e.id === finalEvaluationId)?.grade ?? null;
    const config = resolveConfig(context.settings.schedulerOverrides);
    const stored = isInitial
      ? await deps.store.getReviewState(userId, context.attempt.conceptId)
      : null;
    const transition =
      isInitial && grade && context.attempt.status !== 'finalized'
        ? next(
            stored ?? initialSnapshot(config),
            { kind: 'graded', grade, isCold: context.attempt.isCold },
            config,
            await deps.store.serverNow(userId),
            context.settings.timezone,
          ).next
        : null;
    const misconceptions = transition
      ? await misconceptionChanges(deps.store, userId, context, finalEvaluationId, transition)
      : null;

    try {
      const result = await deps.store.finalizeAttempt({
        userId,
        attemptId,
        finalEvaluationId,
        expectedVersion: stored?.version ?? 0,
        transition,
        configVersion: transition ? config.version : null,
        misconceptions,
      });
      return toResponse(result);
    } catch (error) {
      // Another request changed the review state (e.g. a second tab): reload and recompute once.
      if (error instanceof VersionConflictError && round === 0) continue;
      if (error instanceof VersionConflictError) {
        throw new ApiError(
          'conflict',
          'This concept was updated elsewhere. Reload and try again.',
          true,
        );
      }
      throw error;
    }
  }
  throw new ApiError('conflict', 'Could not finalize. Reload and try again.', true);
}

/**
 * Misconceptions from the latest completed AI evaluation (WB-6), unless the learner overrode the
 * grade to a Pass, plus active ones a cold Pass resolves (DATA_MODEL §4.3).
 */
async function misconceptionChanges(
  store: PracticeStore,
  userId: string,
  context: AttemptContext,
  finalEvaluationId: string,
  transition: ReviewSnapshot,
): Promise<MisconceptionChanges> {
  const final = context.evaluations.find((e) => e.id === finalEvaluationId);
  const ai = context.evaluations
    .filter((e) => e.source === 'ai' && e.status === 'completed')
    .at(-1);
  const feedback = EvaluationResultSchema.safeParse(ai?.feedback);
  const rubric = RubricV1Schema.safeParse(context.question.rubric);
  const disputed = final?.source !== 'ai' && final?.grade === 'pass';
  const { existing, coldPassTimes } = await store.getMisconceptionContext(
    userId,
    context.attempt.conceptId,
  );

  const record =
    feedback.success && !disputed
      ? matchMisconceptions(
          feedback.data.misconceptions,
          rubric.success ? rubric.data : { knownMisconceptions: [] },
          existing,
          context.attempt.answerMd,
        )
      : [];
  const diagnosed = new Set(record.map((m) => m.slug));
  const coldPass = context.attempt.isCold && final?.grade === 'pass';
  const resolve = coldPass
    ? existing
        .filter(
          (m) =>
            m.status === 'active' &&
            shouldResolve({
              consecutiveColdPasses: transition.consecutiveColdPasses,
              // Earlier cold passes since the misconception was last seen, plus this one.
              coldPassesSinceLastSeen:
                coldPassTimes.filter((t) => Date.parse(t) > Date.parse(m.lastSeenAt)).length + 1,
              diagnosedNow: diagnosed.has(m.slug),
            }),
        )
        .map((m) => m.id)
    : [];
  return { record, resolve };
}

function toResponse(result: FinalizeResult): FinalizeResponse {
  return {
    replayed: result.replayed,
    reviewState: result.state
      ? {
          conceptId: result.state.conceptId,
          masteryStatus: result.state.masteryStatus,
          intervalDays: result.state.intervalDays,
          dueAt: result.state.dueAt,
        }
      : null,
  };
}
