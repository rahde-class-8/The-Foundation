import { Link } from 'react-router';
import { QueryBoundary } from '@/components/common/QueryBoundary';
import { Badge } from '@/components/ui/badge';
import { useMisconceptions } from '../hooks/useReviews';

/** Recurring misconceptions and the concepts they affect (WB-6). */
export function MisconceptionsPanel() {
  const query = useMisconceptions();
  return (
    <section aria-labelledby="misconceptions" className="space-y-3">
      <h2 id="misconceptions" className="text-lg font-semibold">
        Misconceptions
      </h2>
      <QueryBoundary
        query={query}
        isEmpty={(items) => items.length === 0}
        empty={
          <p className="text-sm text-muted-foreground">
            No misconceptions diagnosed. AI grading flags them as you practice.
          </p>
        }
      >
        {(items) => (
          <ul className="space-y-2">
            {items.map((m) => (
              <li key={m.id} className="space-y-1 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {m.recurring ? <Badge variant="warning">Recurring</Badge> : null}
                  <span className="font-medium">{m.statementMd}</span>
                </div>
                {m.correctionMd ? <p className="text-muted-foreground">{m.correctionMd}</p> : null}
                <p className="text-xs text-muted-foreground">
                  Seen {m.occurrenceCount}× in{' '}
                  <Link
                    className="underline underline-offset-2"
                    to={`/services/${m.concept.serviceSlug}`}
                  >
                    {m.concept.serviceName}: {m.concept.title}
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
    </section>
  );
}
