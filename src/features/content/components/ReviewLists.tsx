import { Link } from 'react-router';
import type { Overview } from '../api/schemas';

/** Drafts waiting for review (CNT-6). */
export function DraftsPanel({ drafts }: { drafts: Overview['drafts'] }) {
  return (
    <section aria-labelledby="drafts-heading" className="space-y-3">
      <h2 id="drafts-heading" className="text-lg font-semibold">
        Drafts to review
      </h2>
      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No drafts. Select passages and generate some.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Drafts">
          {drafts.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div>
                <p className="font-medium">{d.title}</p>
                <p className="text-xs text-muted-foreground">
                  {d.serviceName} · {d.questionCount} question{d.questionCount === 1 ? '' : 's'} ·{' '}
                  {d.citationCount} citation
                  {d.citationCount === 1 ? '' : 's'}
                </p>
              </div>
              <Link to={`/content/drafts/${d.id}`} className="text-sm underline underline-offset-2">
                Review {d.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Official citations older than 12 months, for re-verification (CONTENT_GOVERNANCE §7). */
export function StalePanel({ stale }: { stale: Overview['stale'] }) {
  return (
    <section aria-labelledby="stale-heading" className="space-y-3">
      <h2 id="stale-heading" className="text-lg font-semibold">
        Citations to re-check
      </h2>
      <p className="text-sm text-muted-foreground">
        AWS documentation cited by published concepts and not checked in the last 12 months. Limits
        change.
      </p>
      {stale.length === 0 ? (
        <p className="text-sm text-muted-foreground">Everything cited was checked recently.</p>
      ) : (
        <ul className="space-y-2" aria-label="Stale citations">
          {stale.map((s) => (
            <li key={s.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {s.title}
                  </a>
                ) : (
                  s.title
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {s.retrievedAt ? `Last checked ${s.retrievedAt.slice(0, 10)}` : 'Never checked'} ·
                cited by {s.conceptCount} concept{s.conceptCount === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
