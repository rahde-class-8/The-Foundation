import type { EvaluationView } from '@core/contracts/practice.ts';
import { selectFinalEvaluation } from '@core/grading/final.ts';

export type Stage = 'evaluating' | 'feedback' | 'self' | 'correction' | 'finalize';

export type FlowEvaluation = Pick<
  EvaluationView,
  'id' | 'source' | 'status' | 'grade' | 'createdAt'
> &
  Partial<
    Pick<EvaluationView, 'feedback' | 'confidence' | 'rubricScore' | 'provider' | 'errorCode'>
  >;

export type FlowSettings = { aiGradingEnabled: boolean; defaultEvalMode: 'ai_first' | 'self_only' };

/** Where a (possibly resumed) initial attempt should pick up (REC-10). */
export function initialStage(evaluations: FlowEvaluation[], settings: FlowSettings): Stage {
  const final = selectFinalEvaluation(evaluations);
  if (final)
    return final.source === 'ai' ? 'feedback' : final.grade === 'pass' ? 'finalize' : 'correction';
  const aiTried = evaluations.some((e) => e.source === 'ai');
  if (aiTried || !settings.aiGradingEnabled || settings.defaultEvalMode === 'self_only')
    return 'self';
  return 'evaluating';
}

export function latestAi(evaluations: FlowEvaluation[]): FlowEvaluation | undefined {
  return evaluations.filter((e) => e.source === 'ai' && e.status === 'completed').at(-1);
}

/** Readable reason for an AI grading fallback (REC-5). */
export function fallbackReason(evaluation: FlowEvaluation | undefined): string {
  switch (evaluation?.status) {
    case 'skipped_disabled':
      return evaluation.errorCode === 'not_configured'
        ? 'AI grading is not configured.'
        : 'AI grading is turned off in Settings.';
    case 'skipped_budget':
      return 'The monthly AI budget is used up.';
    case 'invalid_response':
      return 'The AI grader returned an unusable response.';
    case 'failed':
      return evaluation.errorCode === 'timeout'
        ? 'The AI grader took too long.'
        : 'The AI grader is unavailable right now.';
    default:
      return 'Grade this answer yourself.';
  }
}

export function formatDue(dueAt: string | null, timeZone: string): string {
  if (!dueAt) return 'not scheduled';
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone,
    }).format(new Date(dueAt));
  } catch {
    return new Date(dueAt).toDateString();
  }
}
