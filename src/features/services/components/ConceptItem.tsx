import { CheckCircle2, ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { ReviewStatusBadge } from '@/components/common/ContentBadges';
import { Markdown } from '@/components/common/Markdown';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Concept } from '../api/schemas';
import { CitationList } from './CitationList';
import { MASTERY_LABELS } from './labels';

type Props = { concept: Concept; onFirstExpand: (conceptId: string) => void };

export function ConceptItem({ concept, onFirstExpand }: Props) {
  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const panelId = useId();
  const mastery = concept.progress?.masteryStatus ?? 'new';
  const studied = Boolean(concept.progress?.firstStudiedAt);

  function toggle() {
    const next = !open;
    setOpen(next);
    // Opening the explanation counts as studying it (LIB-7) and as exposure for cold recall.
    if (next && !reported) {
      setReported(true);
      onFirstExpand(concept.id);
    }
  }

  return (
    <li className="rounded-lg border">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="flex w-full items-start gap-3 p-4 text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ChevronDown
            aria-hidden
            className={cn('mt-0.5 size-4 shrink-0 transition-transform', open && 'rotate-180')}
          />
          <span className="flex-1 space-y-1.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{concept.title}</span>
              <ReviewStatusBadge status={concept.status} />
              <Badge variant={mastery === 'new' ? 'outline' : 'secondary'}>
                {MASTERY_LABELS[mastery]}
              </Badge>
              {studied ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle2 aria-hidden className="size-3.5" /> Studied
                </span>
              ) : null}
            </span>
            {concept.summaryMd ? (
              <span className="block text-sm font-normal text-muted-foreground">
                {concept.summaryMd}
              </span>
            ) : null}
            {concept.domains.length > 0 ? (
              <span className="flex flex-wrap gap-1">
                {concept.domains.map((domain) => (
                  <Badge key={domain.id} variant="outline" title={domain.name}>
                    {domain.certification} {domain.code}
                    {domain.relevance === 'supporting' ? ' (supporting)' : ''}
                  </Badge>
                ))}
              </span>
            ) : null}
          </span>
        </button>
      </h3>
      <div id={panelId} hidden={!open} className="space-y-4 border-t p-4">
        {concept.explanationMd ? <Markdown>{concept.explanationMd}</Markdown> : null}
        {concept.examplesMd ? (
          <section className="space-y-1.5">
            <h4 className="text-sm font-semibold">Examples</h4>
            <Markdown>{concept.examplesMd}</Markdown>
          </section>
        ) : null}
        {concept.limitationsMd ? (
          <section className="space-y-1.5">
            <h4 className="text-sm font-semibold">Limitations</h4>
            <Markdown>{concept.limitationsMd}</Markdown>
          </section>
        ) : null}
        <section className="space-y-1.5">
          <h4 className="text-sm font-semibold">Sources</h4>
          <CitationList citations={concept.citations} />
        </section>
      </div>
    </li>
  );
}
