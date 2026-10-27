import { useRef, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryBoundary } from '@/components/common/QueryBoundary';
import { cn } from '@/lib/utils';
import { PassagesPanel } from '../components/PassagesPanel';
import { DraftsPanel, StalePanel } from '../components/ReviewLists';
import { SourcesPanel } from '../components/SourcesPanel';
import { useIngestRunner, useOverview } from '../hooks/useContent';

const TABS = [
  { id: 'sources', label: 'Sources' },
  { id: 'passages', label: 'Passages' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'stale', label: 'Re-check' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function ContentPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.id === params.get('tab'))
    ? (params.get('tab') as Tab)
    : 'sources';
  const query = useOverview();
  const { jobs, run } = useIngestRunner();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (id: Tab) => setParams(id === 'sources' ? {} : { tab: id }, { replace: true });
  function onKey(event: KeyboardEvent, index: number) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + TABS.length) % TABS.length;
    select(TABS[next]?.id ?? 'sources');
    refs.current[next]?.focus();
  }

  return (
    <>
      <PageHeader
        title="Content"
        description="Sources, imports, and drafts awaiting your review."
      />
      <div
        role="tablist"
        aria-label="Content sections"
        className="mb-6 flex gap-1 overflow-x-auto border-b"
      >
        {TABS.map((t, index) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={`content-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls="content-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            onKeyDown={(event) => onKey(event, index)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap',
              tab === t.id
                ? 'border-primary font-medium'
                : 'border-transparent text-muted-foreground',
            )}
          >
            {t.label}
            {t.id === 'drafts' && query.data?.drafts.length ? (
              <span className="ml-1 text-xs text-muted-foreground">{query.data.drafts.length}</span>
            ) : null}
          </button>
        ))}
      </div>
      <div id="content-panel" role="tabpanel" aria-labelledby={`content-tab-${tab}`}>
        <QueryBoundary query={query} loadingLabel="Loading your content…">
          {(data) =>
            tab === 'sources' ? (
              <SourcesPanel sources={data.sources} jobs={jobs} onJob={run} />
            ) : tab === 'passages' ? (
              <PassagesPanel sources={data.sources} isOwner={data.isOwner} />
            ) : tab === 'drafts' ? (
              <DraftsPanel drafts={data.drafts} />
            ) : (
              <StalePanel stale={data.stale} />
            )
          }
        </QueryBoundary>
      </div>
    </>
  );
}
