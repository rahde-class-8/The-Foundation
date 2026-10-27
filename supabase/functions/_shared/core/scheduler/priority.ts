import type { MasteryStatus } from './next.ts';

export type PriorityInput = {
  masteryStatus: MasteryStatus;
  lastColdGrade: 'pass' | 'partial' | 'miss' | null;
  ease: number;
  dueAt: string | null;
  activeMisconceptions?: number;
};

/** Weights of the Weak Box priority (SPACED_REPETITION §6), kept in one place for tuning. */
export const PRIORITY_WEIGHTS = Object.freeze({
  lapsed: 4,
  lastMiss: 3,
  lastPartial: 1.5,
  overdueCapDays: 14,
  overdueDivisor: 7,
  easeMax: 3.0,
  misconception: 0.5,
  misconceptionCap: 3,
});

const DAY_MS = 86_400_000;

/** Weak Box priority (SPACED_REPETITION §6): higher means review sooner. */
export function priorityScore(input: PriorityInput, now: Date): number {
  const w = PRIORITY_WEIGHTS;
  const overdueDays = input.dueAt
    ? Math.max(0, (now.getTime() - new Date(input.dueAt).getTime()) / DAY_MS)
    : 0;
  return (
    (input.masteryStatus === 'lapsed' ? w.lapsed : 0) +
    (input.lastColdGrade === 'miss'
      ? w.lastMiss
      : input.lastColdGrade === 'partial'
        ? w.lastPartial
        : 0) +
    Math.min(overdueDays, w.overdueCapDays) / w.overdueDivisor +
    (w.easeMax - input.ease) +
    w.misconception * Math.min(input.activeMisconceptions ?? 0, w.misconceptionCap)
  );
}

/** Deterministic Weak Box order (WB-2a): priority desc, then due date asc (nulls last), then concept id. */
export function sortByPriority<T extends PriorityInput & { conceptId: string }>(
  items: readonly T[],
  now: Date,
): (T & { priority: number })[] {
  return items
    .map((item) => ({ ...item, priority: round4(priorityScore(item, now)) }))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        compareNullable(a.dueAt, b.dueAt) ||
        (a.conceptId < b.conceptId ? -1 : a.conceptId > b.conceptId ? 1 : 0),
    );
}

/** Scores are compared at 4 decimals so Postgres numeric and JS floats order identically. */
export const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

function compareNullable(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}
