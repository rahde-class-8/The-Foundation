import type { MasteryStatus } from './next.ts';

export type PriorityInput = {
  masteryStatus: MasteryStatus;
  lastColdGrade: 'pass' | 'partial' | 'miss' | null;
  ease: number;
  dueAt: string | null;
  activeMisconceptions?: number;
};

const EASE_MAX = 3.0;
const DAY_MS = 86_400_000;

/** Weak Box priority (SPACED_REPETITION §6): higher means review sooner. */
export function priorityScore(input: PriorityInput, now: Date): number {
  const overdueDays = input.dueAt
    ? Math.max(0, (now.getTime() - new Date(input.dueAt).getTime()) / DAY_MS)
    : 0;
  return (
    (input.masteryStatus === 'lapsed' ? 4 : 0) +
    (input.lastColdGrade === 'miss' ? 3 : input.lastColdGrade === 'partial' ? 1.5 : 0) +
    Math.min(overdueDays, 14) / 7 +
    (EASE_MAX - input.ease) +
    0.5 * Math.min(input.activeMisconceptions ?? 0, 3)
  );
}
