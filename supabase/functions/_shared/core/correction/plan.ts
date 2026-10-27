import type { Verdict } from '../grading/evaluation.ts';
import type { RubricV1 } from '../grading/rubric.ts';

export const MAX_CORRECTION_ROUNDS = 2;

export type CorrectionPlan = { targetPointIds: string[]; prompt: string };

/**
 * Correction targets (GRADING_RUBRICS §9): rubric points judged missing, partial, or contradicted.
 * The static prompt is the fallback when no AI correction prompt is available.
 */
export function planCorrection(
  rubric: RubricV1,
  verdicts: Record<string, Verdict>,
  aiPrompt?: string | null,
): CorrectionPlan {
  const targets = rubric.points.filter((point) => (verdicts[point.id] ?? 'missing') !== 'covered');
  const chosen = targets.length > 0 ? targets : rubric.points.filter((point) => point.critical);
  return {
    targetPointIds: chosen.map((point) => point.id),
    prompt:
      aiPrompt?.trim() ||
      `Without looking at the reference answer, explain in your own words:\n${chosen.map((point) => `- ${point.text}`).join('\n')}`,
  };
}

/** A rubric restricted to the correction targets, for grading a correction attempt. */
export function correctionRubric(rubric: RubricV1, targetPointIds: string[]): RubricV1 {
  const targets = new Set(targetPointIds);
  const points = rubric.points.filter((point) => targets.has(point.id));
  if (points.length === 0) return rubric;
  return {
    ...rubric,
    points: points.some((p) => p.critical)
      ? points
      : points.map((p, i) => ({ ...p, critical: i === 0 })),
  };
}
