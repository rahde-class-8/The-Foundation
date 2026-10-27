import { useCallback, useEffect, useRef, useState } from 'react';
import type { FinalizeResponse } from '@core/contracts/practice.ts';
import { MAX_CORRECTION_ROUNDS, planCorrection } from '@core/correction/plan.ts';
import { EvaluationResultSchema } from '@core/grading/evaluation.ts';
import { selectFinalEvaluation } from '@core/grading/final.ts';
import { RubricV1Schema } from '@core/grading/rubric.ts';
import type { Tick } from '@core/grading/self.ts';
import { Markdown } from '@/components/common/Markdown';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  evaluateAttempt,
  finalizeAttempt,
  revealReference,
  submitAttempt,
  submitSelfEvaluation,
} from '../api/practice';
import type { Grade, Reference, SessionAttempt } from '../api/schemas';
import {
  fallbackReason,
  formatDue,
  initialStage,
  latestAi,
  type FlowEvaluation,
  type FlowSettings,
  type Stage,
} from '../model/flow';
import { isTypingTarget } from '../model/keyboard';
import { AiFeedback } from './AiFeedback';
import { AnswerForm } from './AnswerForm';
import { GradeBadge } from './GradeBadge';
import { GradeButtons } from './GradeButtons';
import { SelfAssessment } from './SelfAssessment';

type Props = {
  sessionId: string;
  attempt: SessionAttempt;
  corrections: SessionAttempt[];
  settings: FlowSettings & { timezone: string };
  onDone: () => void;
};

const toFlow = (e: SessionAttempt['evaluations'][number]): FlowEvaluation => e;

/** One answer from grading to scheduling: AI or self grade → optional override → correction → finalize. */
export function AttemptFlow({ sessionId, attempt, corrections, settings, onDone }: Props) {
  const [evaluations, setEvaluations] = useState<FlowEvaluation[]>(() =>
    attempt.evaluations.map(toFlow),
  );
  const [stage, setStage] = useState<Stage>(() =>
    initialStage(attempt.evaluations.map(toFlow), settings),
  );
  const [reference, setReference] = useState<Reference | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [rounds, setRounds] = useState(corrections.length);
  const [lastCorrectionGrade, setLastCorrectionGrade] = useState<Grade | null>(null);
  const [finalized, setFinalized] = useState<FinalizeResponse | null>(null);
  const evaluating = useRef(false);

  const finalGrade = selectFinalEvaluation(evaluations)?.grade ?? null;
  const ai = latestAi(evaluations);
  const lastAiAttempt = evaluations.filter((e) => e.source === 'ai').at(-1);

  const fail = (cause: unknown) =>
    setError(cause instanceof Error ? cause.message : 'Something went wrong.');

  // AI grading starts as soon as the attempt is saved; the learner can switch to self-grading at any time.
  useEffect(() => {
    if (stage !== 'evaluating' || evaluating.current) return;
    evaluating.current = true;
    evaluateAttempt(attempt.id)
      .then((response) => {
        setEvaluations((current) => [...current, response.evaluation]);
        setStage((current) =>
          current === 'evaluating' ? (response.fallback ? 'self' : 'feedback') : current,
        );
      })
      .catch((cause: unknown) => {
        fail(cause);
        setStage((current) => (current === 'evaluating' ? 'self' : current));
      });
  }, [stage, attempt.id]);

  // The reference answer and rubric are needed for feedback, self-assessment, and corrections.
  useEffect(() => {
    if (reference || stage === 'evaluating') return;
    revealReference(attempt.id).then(setReference).catch(fail);
  }, [stage, reference, attempt.id]);

  const afterGrade = useCallback(
    (grade: Grade) => setStage(grade === 'pass' ? 'finalize' : 'correction'),
    [],
  );

  async function selfGrade(grade: Grade, ticks?: Record<string, Tick>, reason?: string) {
    setBusy(true);
    setError(null);
    try {
      const evaluation = await submitSelfEvaluation({
        attemptId: attempt.id,
        grade,
        ...(ticks ? { ticks } : {}),
        ...(reason ? { reason } : {}),
      });
      setEvaluations((current) => [...current, evaluation]);
      setOverriding(false);
      afterGrade(grade);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    const final = selectFinalEvaluation(evaluations);
    if (!final) return;
    setBusy(true);
    setError(null);
    try {
      setFinalized(await finalizeAttempt(attempt.id, final.id));
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function submitCorrection(answer: string, clientKey: string, durationMs: number) {
    const correction = await submitAttempt({
      sessionId,
      questionVersionId: attempt.questionVersionId,
      answer,
      clientKey,
      parentAttemptId: attempt.id,
      durationMs,
    });
    setRounds((n) => n + 1);
    setLastCorrectionGrade(null);
    if (settings.aiGradingEnabled && settings.defaultEvalMode === 'ai_first') {
      const response = await evaluateAttempt(correction.id).catch(() => null);
      setLastCorrectionGrade(response?.evaluation.grade ?? null);
    }
  }

  const correctionPrompt = (() => {
    if (!reference) return null;
    const rubric = RubricV1Schema.safeParse({ schemaVersion: 1, ...reference.rubric });
    if (!rubric.success) return null;
    const aiFeedback = EvaluationResultSchema.safeParse(ai?.feedback);
    const human = selectFinalEvaluation(evaluations.filter((e) => e.source !== 'ai'));
    const ticks = (human?.feedback as { ticks?: Record<string, Tick> } | undefined)?.ticks ?? {};
    const verdicts =
      aiFeedback.success && (!human || human.createdAt < (ai?.createdAt ?? ''))
        ? Object.fromEntries(aiFeedback.data.pointJudgements.map((j) => [j.pointId, j.verdict]))
        : ticks;
    return planCorrection(
      rubric.data,
      verdicts,
      aiFeedback.success ? aiFeedback.data.correctionPrompt : null,
    ).prompt;
  })();

  if (finalized) {
    return (
      <FinalizedView
        grade={finalGrade}
        dueAt={finalized.reviewState?.dueAt ?? null}
        timeZone={settings.timezone}
        isCold={attempt.isCold}
        onNext={onDone}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-md bg-muted/40 p-4">
        <h3 className="text-sm font-semibold">Your answer</h3>
        <p className="text-sm whitespace-pre-wrap">{attempt.answerMd}</p>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {stage === 'evaluating' ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-muted-foreground">
            Your answer is saved. Grading…
          </p>
          <Button variant="outline" onClick={() => setStage('self')}>
            Grade it myself
          </Button>
        </div>
      ) : null}

      {stage === 'feedback' && ai ? (
        <div className="space-y-4">
          <AiFeedback evaluation={ai} reference={reference} />
          {overriding ? (
            <div className="space-y-3 rounded-md border p-3">
              <Label htmlFor="override-reason">Why are you changing the grade? (optional)</Label>
              <input
                id="override-reason"
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                maxLength={500}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              />
              <GradeButtons
                disabled={busy}
                onGrade={(grade) => void selfGrade(grade, undefined, overrideReason || undefined)}
              />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => ai.grade && afterGrade(ai.grade as Grade)}>
                {ai.grade === 'pass' ? 'Accept and continue' : 'Accept and correct'}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setOverriding(true)}>
                Change the grade
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {stage === 'self' ? (
        reference ? (
          <SelfAssessment
            reference={reference}
            busy={busy}
            intro={
              lastAiAttempt
                ? fallbackReason(lastAiAttempt)
                : 'Compare your answer with the reference, then grade it.'
            }
            onGrade={(grade, ticks) => void selfGrade(grade, ticks)}
          />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Loading the reference answer…
          </p>
        )
      ) : null}

      {stage === 'correction' ? (
        <section aria-labelledby="correction" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="correction" className="text-lg font-semibold">
              Correct it
            </h2>
            {finalGrade ? <GradeBadge grade={finalGrade} /> : null}
          </div>
          {correctionPrompt ? <Markdown>{correctionPrompt}</Markdown> : null}
          {lastCorrectionGrade ? (
            <p className="text-sm" role="status">
              Correction graded: <strong className="capitalize">{lastCorrectionGrade}</strong>
            </p>
          ) : null}
          {rounds < MAX_CORRECTION_ROUNDS && lastCorrectionGrade !== 'pass' ? (
            <AnswerForm
              key={rounds}
              draftScope={`${sessionId}:${attempt.id}:correction:${rounds}`}
              label="Your correction (without looking at the reference)"
              submitLabel="Submit correction"
              onSubmit={submitCorrection}
              secondary={
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void finalize()}
                >
                  Skip and continue
                </Button>
              }
            />
          ) : (
            <Button disabled={busy} onClick={() => void finalize()}>
              Continue
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Corrections help you remember; they do not change this answer&apos;s grade or schedule.
          </p>
        </section>
      ) : null}

      {stage === 'finalize' ? (
        <div className="flex flex-wrap items-center gap-3">
          {finalGrade ? <GradeBadge grade={finalGrade} /> : null}
          <Button disabled={busy} onClick={() => void finalize()}>
            {busy ? 'Scheduling…' : 'Continue'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FinalizedView({
  grade,
  dueAt,
  timeZone,
  isCold,
  onNext,
}: {
  grade: Grade | null;
  dueAt: string | null;
  timeZone: string;
  isCold: boolean;
  onNext: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'n' && !isTypingTarget(event.target)) {
        event.preventDefault();
        onNext();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext]);

  return (
    <section aria-labelledby="scheduled" className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="scheduled" className="text-lg font-semibold">
          Scheduled
        </h2>
        {grade ? <GradeBadge grade={grade} /> : null}
      </div>
      <p className="text-sm">
        Next review: <strong>{formatDue(dueAt, timeZone)}</strong>
        {isCold ? '' : ' (practice from memory later to grow the interval)'}
      </p>
      <Button ref={ref} onClick={onNext} aria-keyshortcuts="n">
        Next question <span className="text-xs opacity-60">N</span>
      </Button>
    </section>
  );
}
