import { deriveGrade } from './derive.ts';
import type { Grade } from './evaluation.ts';
import type { RubricV1 } from './rubric.ts';

export type Tick = 'covered' | 'partial' | 'missing';

/** Suggested grade from the learner's own checklist (GRADING_RUBRICS §6); same rules as AI grading. */
export function suggestGradeFromTicks(rubric: RubricV1, ticks: Record<string, Tick>): Grade {
  return deriveGrade(
    rubric,
    rubric.points.map((point) => ({ pointId: point.id, verdict: ticks[point.id] ?? 'missing' })),
  ).grade;
}
