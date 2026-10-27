import type { EvaluationResult, Grade, Verdict } from './evaluation.ts';
import type { RubricV1 } from './rubric.ts';

const CREDIT: Record<Verdict, number> = { covered: 1, partial: 0.5, missing: 0, contradicted: 0 };

export type Judgement = { pointId: string; verdict: Verdict };
export type IncorrectStatement = { severity: 'minor' | 'major'; relatedPointId: string | null };

/** Confidence below this is surfaced as "check against the reference" (GRADING_RUBRICS §5). */
export const LOW_CONFIDENCE = 0.6;

/**
 * Deterministic grade from rubric judgements (GRADING_RUBRICS §5). The model's own suggested grade
 * never decides the outcome, which keeps instructions hidden in an answer from changing the grade.
 */
export function deriveGrade(
  rubric: RubricV1,
  judgements: Judgement[],
  incorrect: IncorrectStatement[] = [],
): { grade: Grade; score: number } {
  const verdicts = new Map(judgements.map((j) => [j.pointId, j.verdict] as const));
  const totalWeight = rubric.points.reduce((sum, point) => sum + point.weight, 0);
  const earned = rubric.points.reduce(
    (sum, point) => sum + point.weight * CREDIT[verdicts.get(point.id) ?? 'missing'],
    0,
  );
  const score = totalWeight === 0 ? 0 : earned / totalWeight;
  const critical = rubric.points.filter((point) => point.critical);
  const criticalIds = new Set(critical.map((point) => point.id));

  const contradictsCritical =
    critical.some((point) => verdicts.get(point.id) === 'contradicted') ||
    incorrect.some(
      (s) =>
        s.severity === 'major' && s.relatedPointId !== null && criticalIds.has(s.relatedPointId),
    );
  if (contradictsCritical) return { grade: 'miss', score };

  const allCriticalCovered = critical.every((point) => verdicts.get(point.id) === 'covered');
  const anyMajor = incorrect.some((s) => s.severity === 'major');
  if (score >= rubric.thresholds.pass && allCriticalCovered && !anyMajor)
    return { grade: 'pass', score };

  const anyCovered = rubric.points.some((point) => verdicts.get(point.id) === 'covered');
  if (score >= rubric.thresholds.partial || anyCovered) return { grade: 'partial', score };
  return { grade: 'miss', score };
}

/** Grade, score (0–100), and calibrated confidence for a normalized AI evaluation. */
export function gradeEvaluation(rubric: RubricV1, result: EvaluationResult) {
  const { grade, score } = deriveGrade(rubric, result.pointJudgements, result.incorrectStatements);
  // Disagreement between the model's suggestion and the rubric-derived grade lowers confidence.
  const confidence =
    result.suggestedGrade === grade ? result.confidence : Math.min(result.confidence, 0.5);
  return {
    grade,
    rubricScore: Math.round(score * 10000) / 100,
    confidence: Math.round(confidence * 100) / 100,
  };
}
