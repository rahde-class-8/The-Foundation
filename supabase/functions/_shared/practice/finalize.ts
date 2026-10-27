import { FinalizeRequestSchema, type FinalizeResponse } from '../core/contracts/practice.ts';
import { selectFinalEvaluation } from '../core/grading/final.ts';
import { resolveConfig } from '../core/scheduler/config.ts';
import { initialSnapshot, next } from '../core/scheduler/next.ts';
import { ApiError } from '../http/errors.ts';
import { VersionConflictError, type FinalizeResult, type PracticeStore } from './store.ts';

export type FinalizeDeps = { store: PracticeStore; now: () => Date };

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
            deps.now(),
            context.settings.timezone,
          ).next
        : null;

    try {
      const result = await deps.store.finalizeAttempt({
        userId,
        attemptId,
        finalEvaluationId,
        expectedVersion: stored?.version ?? 0,
        transition,
        configVersion: transition ? config.version : null,
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
