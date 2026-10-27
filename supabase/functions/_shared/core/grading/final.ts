import type { Grade } from './evaluation.ts';

export type EvaluationSummary = {
  id: string;
  source: 'ai' | 'self' | 'override';
  status: 'completed' | 'failed' | 'invalid_response' | 'skipped_budget' | 'skipped_disabled';
  grade: Grade | null;
  createdAt: string;
};

/**
 * The evaluation that finalization must use (ADR-0008, GRADING_RUBRICS §7): the latest completed
 * self/override evaluation, otherwise the latest completed AI evaluation.
 */
export function selectFinalEvaluation<E extends EvaluationSummary>(evaluations: E[]): E | null {
  const completed = evaluations
    .filter((e) => e.status === 'completed' && e.grade !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const human = completed.filter((e) => e.source !== 'ai');
  return human.at(-1) ?? completed.filter((e) => e.source === 'ai').at(-1) ?? null;
}
