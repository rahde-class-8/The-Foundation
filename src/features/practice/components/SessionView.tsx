import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { rankQuestions } from '@core/selection/rank.ts';
import { Button } from '@/components/ui/button';
import { endSession, submitAttempt } from '../api/practice';
import type { Summary } from '../api/schemas';
import { practiceKeys, useCandidates, useSessionState, useSettings } from '../hooks/usePractice';
import { AnswerForm } from './AnswerForm';
import { AttemptFlow } from './AttemptFlow';
import { QuestionCard } from './QuestionCard';

export function SessionView({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const session = useSessionState(sessionId);
  const candidates = useCandidates(sessionId);
  const settings = useSettings();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: practiceKeys.session(sessionId) }),
      queryClient.invalidateQueries({ queryKey: practiceKeys.candidates(sessionId) }),
      queryClient.invalidateQueries({ queryKey: practiceKeys.scopes }),
    ]);

  const next = useMemo(() => {
    if (!candidates.data || !session.data) return null;
    return (
      rankQuestions(candidates.data.candidates, {
        scope: session.data.scopeType,
        now: new Date(),
        endOfToday: candidates.data.endOfToday,
        newConceptsRemaining: candidates.data.newConceptsRemaining,
      })[0] ?? null
    );
  }, [candidates.data, session.data]);

  async function finish() {
    try {
      setSummary(await endSession(sessionId));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not end the session.');
    }
  }

  if (summary) return <SessionSummary summary={summary} />;

  if (session.isPending || candidates.isPending || settings.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading your session…
      </p>
    );
  }
  if (session.isError || candidates.isError || settings.isError) {
    return (
      <div role="alert" className="space-y-3">
        <p className="text-sm">{(session.error ?? candidates.error ?? settings.error)?.message}</p>
        <Button variant="outline" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!session.data) {
    return (
      <p className="text-sm">
        Session not found. <Link to="/practice">Start a new one.</Link>
      </p>
    );
  }

  const attempts = session.data.attempts;
  const pending = attempts.find((a) => a.attemptKind === 'initial' && a.status !== 'finalized');
  const answered = attempts.filter(
    (a) => a.attemptKind === 'initial' && a.status === 'finalized',
  ).length;
  const flowSettings = {
    aiGradingEnabled: settings.data.aiGradingEnabled,
    defaultEvalMode: settings.data.defaultEvalMode,
    timezone: settings.data.timezone,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {answered} answered this session
        </p>
        <Button variant="ghost" size="sm" onClick={() => void finish()}>
          End session
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {pending ? (
        <>
          <QuestionCard
            serviceName={pending.serviceName}
            conceptTitle={pending.conceptTitle}
            dimension={pending.dimension}
            promptMd={pending.promptMd}
          />
          <AttemptFlow
            key={pending.id}
            sessionId={sessionId}
            attempt={pending}
            corrections={attempts.filter((a) => a.parentAttemptId === pending.id)}
            settings={flowSettings}
            onDone={() => void refresh()}
          />
        </>
      ) : next ? (
        <>
          <QuestionCard
            serviceName={next.serviceName}
            conceptTitle={next.conceptTitle}
            dimension={next.dimension}
            promptMd={next.promptMd}
          />
          <AnswerForm
            key={next.questionVersionId}
            draftScope={`${sessionId}:${next.questionVersionId}`}
            label="Your answer"
            submitLabel="Submit answer"
            onSubmit={async (answer, clientKey, durationMs) => {
              await submitAttempt({
                sessionId,
                questionVersionId: next.questionVersionId,
                answer,
                clientKey,
                durationMs,
              });
              await refresh();
            }}
          />
        </>
      ) : (
        <div className="space-y-3 rounded-md border border-dashed p-6 text-sm">
          <p>
            {answered > 0
              ? 'Nothing more to practice in this session.'
              : 'No questions are available for this selection.'}
          </p>
          {answered === 0 ? (
            <p className="text-muted-foreground">
              Practice uses published content only. Review and publish concepts in content/catalog
              (see its README), or choose another scope.
            </p>
          ) : null}
          <Button onClick={() => void finish()}>Finish session</Button>
        </div>
      )}
    </div>
  );
}

function SessionSummary({ summary }: { summary: Summary }) {
  return (
    <section aria-labelledby="summary" className="space-y-4">
      <h2 id="summary" className="text-lg font-semibold">
        Session complete
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ['Answered', summary.finalized],
            ['Pass', summary.pass],
            ['Partial', summary.partial],
            ['Miss', summary.miss],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-md border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {summary.toReview.length > 0 ? (
        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold">Scheduled for tomorrow</h3>
          <ul className="list-disc pl-5 text-sm">
            {summary.toReview.map((concept) => (
              <li key={concept.conceptId}>{concept.title}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Button asChild>
        <Link to="/practice">Start another session</Link>
      </Button>
    </section>
  );
}
