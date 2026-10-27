import type { SchedulerConfig } from './config.ts';
import { addDays, localDateOf, startOfLocalDay, type LocalDate } from './dates.ts';

export type Grade = 'pass' | 'partial' | 'miss';
export type MasteryStatus = 'new' | 'learning' | 'reviewing' | 'mastered' | 'lapsed';

/** The scheduling fields of review_state (DATA_MODEL §4.3). */
export type ReviewSnapshot = {
  masteryStatus: MasteryStatus;
  intervalDays: number;
  ease: number;
  consecutiveColdPasses: number;
  lapseCount: number;
  preLapseIntervalDays: number | null;
  totalColdAttempts: number;
  lastColdGrade: Grade | null;
  lastReviewedAt: string | null;
  dueAt: string | null;
  manualDueOverride: boolean;
};

export type Outcome =
  | { kind: 'graded'; grade: Grade; isCold: boolean }
  | { kind: 'manual_override'; dueOn: LocalDate; reason: string };

export type Transition = { next: ReviewSnapshot; eventType: 'graded' | 'manual_override' };

export function initialSnapshot(config: SchedulerConfig): ReviewSnapshot {
  return {
    masteryStatus: 'new',
    intervalDays: 0,
    ease: config.initialEase,
    consecutiveColdPasses: 0,
    lapseCount: 0,
    preLapseIntervalDays: null,
    totalColdAttempts: 0,
    lastColdGrade: null,
    lastReviewedAt: null,
    dueAt: null,
    manualDueOverride: false,
  };
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Mastery status from counters (MASTERY_MODEL §4). `wasEstablished` = reviewing/mastered before this grade. */
export function deriveStatus(
  snapshot: Pick<
    ReviewSnapshot,
    'consecutiveColdPasses' | 'intervalDays' | 'totalColdAttempts' | 'lastColdGrade'
  >,
  config: SchedulerConfig,
  lapsed: boolean,
): MasteryStatus {
  if (
    snapshot.consecutiveColdPasses >= config.masteredMinPasses &&
    snapshot.intervalDays >= config.masteredMinIntervalDays
  ) {
    return 'mastered';
  }
  if (snapshot.consecutiveColdPasses >= 1) return 'reviewing';
  if (lapsed) return 'lapsed';
  return 'learning';
}

/**
 * Pure scheduler (SPACED_REPETITION §4–§7): computes the next review state for one concept.
 * `now` and `timeZone` are injected so results are deterministic.
 */
export function next(
  state: ReviewSnapshot,
  outcome: Outcome,
  config: SchedulerConfig,
  now: Date,
  timeZone: string,
): Transition {
  const today = localDateOf(now, timeZone);
  const dueOn = (days: number) => startOfLocalDay(addDays(today, days), timeZone).toISOString();

  if (outcome.kind === 'manual_override') {
    return {
      eventType: 'manual_override',
      next: {
        ...state,
        dueAt: startOfLocalDay(outcome.dueOn, timeZone).toISOString(),
        manualDueOverride: true,
      },
    };
  }

  const { grade, isCold } = outcome;

  // §5: non-cold attempts never lengthen spacing.
  if (!isCold) {
    const tomorrow = dueOn(1);
    const nextState = { ...state, manualDueOverride: false };
    if (grade === 'pass') {
      if (state.dueAt === null) nextState.dueAt = tomorrow;
    } else {
      nextState.dueAt = state.dueAt === null || state.dueAt > tomorrow ? tomorrow : state.dueAt;
    }
    if (nextState.masteryStatus === 'new') nextState.masteryStatus = 'learning';
    return { eventType: 'graded', next: nextState };
  }

  let { intervalDays, ease, consecutiveColdPasses, lapseCount, preLapseIntervalDays } = state;
  const wasEstablished = state.masteryStatus === 'reviewing' || state.masteryStatus === 'mastered';
  let lapsed = state.masteryStatus === 'lapsed';

  if (grade === 'pass') {
    if (preLapseIntervalDays !== null) {
      const factor =
        state.lastColdGrade === 'miss' ? config.recoveryFactorMiss : config.recoveryFactorPartial;
      intervalDays = Math.max(
        config.firstPassIntervalDays,
        Math.round(preLapseIntervalDays * factor),
      );
      preLapseIntervalDays = null;
    } else if (consecutiveColdPasses === 0) {
      intervalDays = config.firstPassIntervalDays;
    } else {
      intervalDays = Math.max(intervalDays + 1, Math.round(intervalDays * ease));
    }
    intervalDays = Math.min(intervalDays, config.maxIntervalDays);
    ease = clamp(round2(ease + config.easeDeltaPass), config.easeMin, config.easeMax);
    consecutiveColdPasses += 1;
    lapsed = false;
  } else {
    if (intervalDays >= config.firstPassIntervalDays && preLapseIntervalDays === null) {
      preLapseIntervalDays = intervalDays;
    }
    if (grade === 'miss' && wasEstablished) lapseCount += 1;
    if (wasEstablished) lapsed = true;
    intervalDays = grade === 'miss' ? config.missIntervalDays : config.partialIntervalDays;
    ease = clamp(
      round2(ease + (grade === 'miss' ? config.easeDeltaMiss : config.easeDeltaPartial)),
      config.easeMin,
      config.easeMax,
    );
    consecutiveColdPasses = 0;
  }

  const counters = {
    intervalDays,
    consecutiveColdPasses,
    totalColdAttempts: state.totalColdAttempts + 1,
    lastColdGrade: grade,
  };

  return {
    eventType: 'graded',
    next: {
      ...state,
      ...counters,
      ease,
      lapseCount,
      preLapseIntervalDays,
      masteryStatus: deriveStatus(counters, config, lapsed),
      lastReviewedAt: now.toISOString(),
      dueAt: dueOn(intervalDays),
      manualDueOverride: false,
    },
  };
}
