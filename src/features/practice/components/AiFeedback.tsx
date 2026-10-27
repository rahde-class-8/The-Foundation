import { EvaluationResultSchema } from '@core/grading/evaluation.ts';
import { LOW_CONFIDENCE } from '@core/grading/derive.ts';
import { Markdown } from '@/components/common/Markdown';
import type { Grade, Reference } from '../api/schemas';
import type { FlowEvaluation } from '../model/flow';
import { GradeBadge } from './GradeBadge';
import { ReferencePanel } from './ReferencePanel';

const VERDICT_LABEL = {
  covered: 'Covered',
  partial: 'Partly covered',
  missing: 'Missing',
  contradicted: 'Contradicted',
} as const;

/** AI grade with misconceptions, missing points, and confidence (REC-4). */
export function AiFeedback({
  evaluation,
  reference,
}: {
  evaluation: FlowEvaluation;
  reference: Reference | null;
}) {
  const feedback = EvaluationResultSchema.safeParse(evaluation.feedback);
  const confidence = evaluation.confidence ?? null;
  const lowConfidence = confidence !== null && confidence < LOW_CONFIDENCE;
  const pointText = new Map(reference?.rubric.points.map((p) => [p.id, p.text]) ?? []);

  return (
    <section aria-labelledby="ai-feedback" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="ai-feedback" className="text-lg font-semibold">
          AI grade
        </h2>
        {evaluation.grade ? <GradeBadge grade={evaluation.grade as Grade} /> : null}
        {confidence !== null ? (
          <span className="text-xs text-muted-foreground">
            Confidence {Math.round(confidence * 100)}%
          </span>
        ) : null}
        {evaluation.provider === 'mock' ? (
          <span className="text-xs text-amber-700 dark:text-amber-300">
            Mock grader (local development)
          </span>
        ) : null}
      </div>
      {lowConfidence ? (
        <p role="note" className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          Low confidence: check this grade against the reference answer and override it if needed.
        </p>
      ) : null}
      {feedback.success ? (
        <>
          <Markdown>{feedback.data.feedbackMd}</Markdown>
          <ul className="space-y-1.5" aria-label="Rubric points">
            {feedback.data.pointJudgements.map((judgement) => (
              <li key={judgement.pointId} className="text-sm">
                <span className="font-medium">{VERDICT_LABEL[judgement.verdict]}:</span>{' '}
                {pointText.get(judgement.pointId) ?? judgement.pointId}
              </li>
            ))}
          </ul>
          {feedback.data.incorrectStatements.length > 0 ? (
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold">Incorrect statements</h3>
              <ul className="space-y-2">
                {feedback.data.incorrectStatements.map((statement, index) => (
                  <li key={index} className="text-sm">
                    <q className="italic">{statement.quote}</q> — {statement.whyIncorrect}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {feedback.data.misconceptions.length > 0 ? (
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold">Misconceptions</h3>
              <ul className="space-y-2">
                {feedback.data.misconceptions.map((m, index) => (
                  <li key={index} className="text-sm">
                    {m.statement} <span className="text-muted-foreground">→ {m.correction}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {feedback.data.missingSummary ? (
            <p className="text-sm">
              <span className="font-semibold">Missing: </span>
              {feedback.data.missingSummary}
            </p>
          ) : null}
        </>
      ) : null}
      {reference ? <ReferencePanel reference={reference} open={lowConfidence} /> : null}
    </section>
  );
}
