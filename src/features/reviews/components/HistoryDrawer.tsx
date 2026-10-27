import { MasteryBadge, type MasteryStatus } from '@/components/common/MasteryBadge';
import { QueryBoundary } from '@/components/common/QueryBoundary';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { GradeBadge } from '@/features/practice';
import type { History } from '../api/schemas';
import { useConceptHistory } from '../hooks/useReviews';
import { formatDateTime, formatDay } from '../model/format';

type TimelineEntry = { at: string; key: string; node: React.ReactNode };

function timeline(history: History, timeZone: string): TimelineEntry[] {
  const events = history.events.map((e) => ({
    at: e.occurredAt,
    key: e.id,
    node:
      e.eventType === 'manual_override' ? (
        <>
          <strong>Rescheduled</strong> from {formatDay(e.prevDueAt, timeZone)} to{' '}
          {formatDay(e.newDueAt, timeZone)}
          {e.reason ? <span className="text-muted-foreground"> — “{e.reason}”</span> : null}
        </>
      ) : e.eventType === 'graded' ? (
        <>
          <strong>Scheduled</strong> after {e.grade ? <GradeBadge grade={e.grade} /> : 'a grade'}{' '}
          {e.isCold ? 'cold recall' : 'non-cold practice'}: next review{' '}
          {formatDay(e.newDueAt, timeZone)}
          {e.newIntervalDays !== null
            ? ` (interval ${e.prevIntervalDays ?? 0} → ${e.newIntervalDays} days)`
            : ''}
        </>
      ) : (
        <strong>{e.eventType === 'reset' ? 'Reset' : 'Started'}</strong>
      ),
  }));
  const attempts = history.attempts.map((a) => ({
    at: a.submittedAt,
    key: a.id,
    node: (
      <>
        <strong>{a.attemptKind === 'correction' ? 'Correction' : 'Answer'}</strong>{' '}
        {a.attemptKind === 'initial' ? (
          <Badge variant={a.isCold ? 'info' : 'outline'}>{a.isCold ? 'Cold' : 'Not cold'}</Badge>
        ) : null}{' '}
        {a.grade ? (
          <GradeBadge grade={a.grade} />
        ) : (
          <span className="text-muted-foreground">not graded</span>
        )}
        {a.gradeSource ? (
          <span className="text-muted-foreground">
            {' '}
            ({a.gradeSource === 'ai' ? 'AI' : a.gradeSource})
          </span>
        ) : null}
        <span className="text-muted-foreground"> · question v{a.questionVersion}</span>
      </>
    ),
  }));
  return [...events, ...attempts].sort(
    (x, y) => x.at.localeCompare(y.at) || x.key.localeCompare(y.key),
  );
}

/** Everything that happened to one concept, oldest first (WB-4). */
export function HistoryDrawer({
  conceptId,
  timeZone,
  onClose,
}: {
  conceptId: string;
  timeZone: string;
  onClose: () => void;
}) {
  const query = useConceptHistory(conceptId);
  return (
    <Dialog
      open
      onClose={onClose}
      variant="drawer"
      title={query.data ? query.data.concept.title : 'History'}
      description={query.data?.concept.serviceName}
    >
      <QueryBoundary query={query} loadingLabel="Loading history…">
        {(history) => (
          <div className="space-y-5">
            {history.state ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <MasteryBadge status={history.state.masteryStatus as MasteryStatus} />
                <span>Next review {formatDay(history.state.dueAt, timeZone)}</span>
                <span className="text-muted-foreground">
                  · interval {history.state.intervalDays} d · ease {history.state.ease.toFixed(2)} ·
                  lapses {history.state.lapseCount}
                </span>
              </div>
            ) : null}
            {history.misconceptions.length > 0 ? (
              <section aria-labelledby="history-misconceptions" className="space-y-2">
                <h3 id="history-misconceptions" className="text-sm font-semibold">
                  Misconceptions
                </h3>
                <ul className="space-y-1 text-sm">
                  {history.misconceptions.map((m) => (
                    <li key={m.id}>
                      {m.statementMd}{' '}
                      <span className="text-muted-foreground">
                        ({m.status === 'active' ? `seen ${m.occurrenceCount}×` : 'resolved'})
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section aria-labelledby="history-timeline" className="space-y-2">
              <h3 id="history-timeline" className="text-sm font-semibold">
                Timeline
              </h3>
              <ol aria-labelledby="history-timeline" className="space-y-3 border-l pl-4 text-sm">
                {timeline(history, timeZone).map((entry) => (
                  <li key={entry.key} className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(entry.at, timeZone)}
                    </p>
                    <p>{entry.node}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </QueryBoundary>
    </Dialog>
  );
}
