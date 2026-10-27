import { OverrideRequestSchema, type OverrideResponse } from '../core/contracts/reviews.ts';
import { resolveConfig } from '../core/scheduler/config.ts';
import { planOverride } from '../core/scheduler/override.ts';
import { ApiError } from '../http/errors.ts';
import { NotFoundError, VersionConflictError, type PracticeStore } from '../practice/store.ts';

export type OverrideDeps = { store: PracticeStore };

/**
 * POST /override-schedule (API_CONTRACTS §4, SPACED_REPETITION §7): reschedules a concept to a local
 * date. Idempotent on clientKey; a concurrent change is retried once.
 */
export async function overrideSchedule(
  deps: OverrideDeps,
  userId: string,
  body: unknown,
): Promise<OverrideResponse> {
  const parsed = OverrideRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      'validation_failed',
      'conceptId and clientKey must be UUIDs, dueOn a YYYY-MM-DD date, and reason at most 300 characters.',
    );
  }
  const { conceptId, dueOn, reason, clientKey } = parsed.data;

  for (let round = 0; round < 2; round += 1) {
    const state = await deps.store.getReviewState(userId, conceptId);
    if (!state) throw new ApiError('not_found', 'This concept has no review schedule yet.');
    const settings = await deps.store.getSettings(userId);
    const plan = planOverride(
      state,
      { dueOn, reason },
      resolveConfig(settings.schedulerOverrides),
      await deps.store.serverNow(userId),
      settings.timezone,
    );
    if (!plan.ok) throw new ApiError('validation_failed', plan.message);

    try {
      const result = await deps.store.applyOverride({
        userId,
        conceptId,
        dueAt: plan.next.dueAt ?? '',
        reason: reason.trim(),
        clientKey,
        expectedVersion: state.version,
      });
      return {
        replayed: result.replayed,
        reviewState: {
          conceptId: result.state.conceptId,
          masteryStatus: result.state.masteryStatus,
          intervalDays: result.state.intervalDays,
          dueAt: result.state.dueAt,
          manualDueOverride: result.state.manualDueOverride,
        },
        event: { id: result.eventId, eventType: 'manual_override' },
      };
    } catch (error) {
      if (error instanceof NotFoundError)
        throw new ApiError('not_found', 'This concept has no review schedule yet.');
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
  throw new ApiError('conflict', 'Could not reschedule. Reload and try again.', true);
}
