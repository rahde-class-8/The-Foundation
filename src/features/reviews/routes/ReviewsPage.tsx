import { useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryBoundary } from '@/components/common/QueryBoundary';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DUE_WINDOWS, type DueReview, type DueWindow } from '../api/schemas';
import { DueList } from '../components/DueList';
import { HistoryDrawer } from '../components/HistoryDrawer';
import { MisconceptionsPanel } from '../components/MisconceptionsPanel';
import { RescheduleDialog } from '../components/RescheduleDialog';
import { useDueReviews } from '../hooks/useReviews';

const LABEL: Record<DueWindow, string> = {
  today: 'Due today',
  overdue: 'Overdue',
  upcoming: 'Upcoming',
};
const EMPTY: Record<DueWindow, string> = {
  today: 'Nothing is due today.',
  overdue: 'Nothing is overdue.',
  upcoming: 'No upcoming reviews yet. Practice a service to schedule some.',
};

export function ReviewsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (DUE_WINDOWS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as DueWindow)
    : 'today';
  const query = useDueReviews(tab);
  const [rescheduling, setRescheduling] = useState<DueReview | null>(null);
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (window: DueWindow) =>
    setParams(window === 'today' ? {} : { tab: window }, { replace: true });
  function onTabKey(event: KeyboardEvent, index: number) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const nextIndex = (index + delta + DUE_WINDOWS.length) % DUE_WINDOWS.length;
    select(DUE_WINDOWS[nextIndex] ?? 'today');
    tabs.current[nextIndex]?.focus();
  }

  const counts = query.data?.counts;
  const dueNow = counts ? counts.today + counts.overdue : 0;
  const timeZone = query.data?.timezone ?? 'UTC';

  return (
    <>
      <PageHeader
        title="Weak Box"
        description="Due, overdue, and upcoming reviews, weakest concepts first."
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          to="/practice?start=due_reviews"
          aria-disabled={dueNow === 0}
          className={cn(buttonVariants(), dueNow === 0 && 'pointer-events-none opacity-50')}
          tabIndex={dueNow === 0 ? -1 : undefined}
        >
          Start review session{counts ? ` (${dueNow})` : ''}
        </Link>
        <Link to="/practice?start=weak" className={buttonVariants({ variant: 'outline' })}>
          Practice weak concepts
        </Link>
      </div>

      {notice ? (
        <p role="status" className="mb-4 rounded-md border px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}

      <div role="tablist" aria-label="Review windows" className="mb-4 flex gap-1 border-b">
        {DUE_WINDOWS.map((window, index) => (
          <button
            key={window}
            ref={(el) => {
              tabs.current[index] = el;
            }}
            id={`tab-${window}`}
            role="tab"
            type="button"
            aria-selected={tab === window}
            aria-controls="review-panel"
            tabIndex={tab === window ? 0 : -1}
            onClick={() => select(window)}
            onKeyDown={(event) => onTabKey(event, index)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === window
                ? 'border-primary font-medium'
                : 'border-transparent text-muted-foreground',
            )}
          >
            {LABEL[window]}
            {counts ? (
              <span className="ml-1 text-xs text-muted-foreground">{counts[window]}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div id="review-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mb-10">
        <QueryBoundary
          query={query}
          isEmpty={(data) => data.items.length === 0}
          empty={<p className="text-sm text-muted-foreground">{EMPTY[tab]}</p>}
          loadingLabel="Loading reviews…"
        >
          {(data) => (
            <DueList
              items={data.items}
              timeZone={data.timezone}
              onReschedule={setRescheduling}
              onHistory={setHistoryOf}
            />
          )}
        </QueryBoundary>
      </div>

      <MisconceptionsPanel />

      {rescheduling && query.data ? (
        <RescheduleDialog
          item={rescheduling}
          today={query.data.today}
          timeZone={timeZone}
          onClose={() => setRescheduling(null)}
          onDone={setNotice}
        />
      ) : null}
      {historyOf ? (
        <HistoryDrawer
          conceptId={historyOf}
          timeZone={timeZone}
          onClose={() => setHistoryOf(null)}
        />
      ) : null}
    </>
  );
}
