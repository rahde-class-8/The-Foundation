import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { MAX_DRAFT_PASSAGES } from '@core/content/drafts.ts';
import type { GenerateResponse } from '@core/contracts/content.ts';
import { Markdown } from '@/components/common/Markdown';
import { QueryBoundary } from '@/components/common/QueryBoundary';
import { TrustBadge } from '@/components/common/ContentBadges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { generateDrafts, listServices, searchPassages } from '../api/content';
import type { SourceRow } from '../api/schemas';
import { contentKeys } from '../hooks/useContent';
import { importErrorMessage } from '../model/upload';

const selectClass = 'h-9 rounded-md border border-input bg-transparent px-3 text-sm';

const where = (p: {
  pageStart: number | null;
  pageEnd: number | null;
  sectionPath: string | null;
}) =>
  [
    p.pageStart
      ? p.pageEnd && p.pageEnd !== p.pageStart
        ? `pages ${p.pageStart}–${p.pageEnd}`
        : `page ${p.pageStart}`
      : null,
    p.sectionPath,
  ]
    .filter(Boolean)
    .join(' · ');

/** Browse and search passages, then ask for AI drafts from the selected ones (CNT-4, CNT-5). */
export function PassagesPanel({ sources, isOwner }: { sources: SourceRow[]; isOwner: boolean }) {
  const queryClient = useQueryClient();
  const ready = sources.filter((s) => s.status === 'ready');
  const [q, setQ] = useState('');
  const [typed, setTyped] = useState('');
  const [sourceId, setSourceId] = useState(ready[0]?.id ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  const query = useQuery({
    queryKey: contentKeys.passages(q, sourceId),
    queryFn: () => searchPassages(q, sourceId || undefined),
    enabled: q !== '' || sourceId !== '',
  });
  const services = useQuery({
    queryKey: ['content', 'services'],
    queryFn: listServices,
    enabled: isOwner,
  });

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length < MAX_DRAFT_PASSAGES
          ? [...current, id]
          : current,
    );

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setResult(null);
    try {
      const response = await generateDrafts({
        passageIds: selected,
        serviceId: String(form.get('service')),
        maxConcepts: Number(form.get('maxConcepts')),
      });
      setResult(response);
      if (response.drafts.length > 0) setSelected([]);
      await queryClient.invalidateQueries({ queryKey: contentKeys.overview });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate drafts.');
    }
  }

  return (
    <section aria-labelledby="passages-heading" className="space-y-4">
      <h2 id="passages-heading" className="text-lg font-semibold">
        Passages
      </h2>
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="passage-search">Search</Label>
          <Input
            id="passage-search"
            type="search"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="visibility timeout"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="passage-source">Source</Label>
          <select
            id="passage-source"
            className={selectClass}
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          >
            <option value="">All sources</option>
            {ready.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {q === '' && sourceId === '' ? (
        <p className="text-sm text-muted-foreground">
          Search, or pick a source to browse its passages.
        </p>
      ) : (
        <QueryBoundary
          query={query}
          isEmpty={(rows) => rows.length === 0}
          empty={<p className="text-sm text-muted-foreground">No passages match.</p>}
        >
          {(rows) => (
            <ul className="space-y-2" aria-label="Passages">
              {rows.map((p) => (
                <li key={p.id} className="rounded-md border p-3">
                  <label className="flex gap-3">
                    {isOwner ? (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selected.includes(p.id)}
                        onChange={() => toggle(p.id)}
                        aria-label={`Select passage ${p.ordinal} of ${p.sourceTitle}`}
                      />
                    ) : null}
                    <span className="min-w-0 space-y-1 text-sm">
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <TrustBadge tier={p.trustTier} />
                        <span>{p.sourceTitle}</span>
                        {where(p) ? <span>{where(p)}</span> : null}
                      </span>
                      <span className="block line-clamp-4">
                        <Markdown>{p.text}</Markdown>
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      )}

      {isOwner ? (
        <form
          onSubmit={(event) => void generate(event)}
          className="space-y-3 rounded-md border p-3"
          aria-labelledby="generate-heading"
        >
          <h3 id="generate-heading" className="text-sm font-semibold">
            Draft concepts from {selected.length} selected passage{selected.length === 1 ? '' : 's'}
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="draft-service">Service</Label>
              <select id="draft-service" name="service" required className={selectClass}>
                {(services.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-count">Up to</Label>
              <select id="draft-count" name="maxConcepts" defaultValue="3" className={selectClass}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} concept{n === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={selected.length === 0 || !services.data?.length}>
              Generate drafts
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Drafts are private and never used for practice until you review and approve them.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {result ? (
            <div role="status" className="space-y-1 text-sm">
              {result.job.status === 'failed' ? (
                <p className="text-destructive">{importErrorMessage(result.job.errorCode)}</p>
              ) : (
                <p>
                  {result.drafts.length} draft{result.drafts.length === 1 ? '' : 's'} created:{' '}
                  {result.drafts.map((d, i) => (
                    <span key={d.conceptId}>
                      {i > 0 ? ', ' : ''}
                      <Link
                        className="underline underline-offset-2"
                        to={`/content/drafts/${d.conceptId}`}
                      >
                        {d.title}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
              {result.rejected.map((r) => (
                <p key={r.title} className="text-xs text-muted-foreground">
                  Skipped “{r.title}”: {r.reason}
                </p>
              ))}
            </div>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
