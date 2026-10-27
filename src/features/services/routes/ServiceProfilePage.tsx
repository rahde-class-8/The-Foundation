import { ExternalLink } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ReviewStatusBadge } from '@/components/common/ContentBadges';
import { Markdown } from '@/components/common/Markdown';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryBoundary } from '@/components/common/QueryBoundary';
import { Button } from '@/components/ui/button';
import { DIMENSION_KEYS, type ServiceProfile } from '../api/schemas';
import { ConceptItem } from '../components/ConceptItem';
import { DIMENSION_LABELS, RELATION_LABELS, serviceProgressLabel } from '../components/labels';
import { useMarkConceptExposed, useServiceProfile } from '../hooks/useCatalog';

function NotFound() {
  return (
    <>
      <PageHeader
        title="Service not found"
        description="This service does not exist or is not available."
      />
      <Link className="text-sm underline underline-offset-4" to="/services">
        Back to the service library
      </Link>
    </>
  );
}

function Profile({
  service,
  onExpose,
}: {
  service: ServiceProfile;
  onExpose: (conceptId: string) => void;
}) {
  const reviewing = service.concepts.filter(
    (c) => c.progress?.masteryStatus === 'reviewing' || c.progress?.masteryStatus === 'mastered',
  ).length;
  const studied = service.concepts.filter((c) => c.progress?.firstStudiedAt).length;
  const relationGroups = Object.entries(RELATION_LABELS)
    .map(([relation, label]) => ({
      label,
      items: service.related.filter((r) => r.relation === relation),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <article className="space-y-10">
      <header className="space-y-3">
        <p className="text-sm text-muted-foreground">
          <Link to="/services" className="underline underline-offset-4">
            Services
          </Link>{' '}
          / {service.category.name}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{service.name}</h1>
          <ReviewStatusBadge status={service.status} />
        </div>
        {service.aliases.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Also known as {service.aliases.join(', ')}
          </p>
        ) : null}
        {service.summaryMd ? <p className="max-w-prose">{service.summaryMd}</p> : null}
        {service.status !== 'published' ? (
          <p className="max-w-prose rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            This content is awaiting review against its sources and is not yet used for practice.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          {service.status === 'published' && service.concepts.some((c) => c.questionCount > 0) ? (
            <Button asChild>
              <Link to={`/practice?start=service&id=${service.id}`}>Practice this service</Link>
            </Button>
          ) : (
            <Button disabled title="Practice uses published content only">
              Practice this service
            </Button>
          )}
          {service.docsUrl ? (
            <a
              href={service.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
            >
              AWS documentation <ExternalLink aria-hidden className="size-3.5" />
            </a>
          ) : null}
        </div>
      </header>

      <section aria-labelledby="mastery-profile" className="space-y-4">
        <h2 id="mastery-profile" className="text-lg font-semibold">
          Mastery profile
        </h2>
        <dl className="grid gap-4 md:grid-cols-2">
          {DIMENSION_KEYS.map((key) => (
            <div key={key} className="space-y-1.5 rounded-lg border p-4">
              <dt className="text-sm font-semibold">{DIMENSION_LABELS[key]}</dt>
              <dd>
                {service.dimensions[key] ? (
                  <Markdown>{service.dimensions[key]}</Markdown>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Not yet authored</p>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="concepts" className="space-y-4">
        <div className="space-y-1">
          <h2 id="concepts" className="text-lg font-semibold">
            Concepts
          </h2>
          <p className="text-sm text-muted-foreground">
            {serviceProgressLabel(reviewing, service.concepts.length)} · {studied} studied
          </p>
        </div>
        <ul className="space-y-3">
          {service.concepts.map((concept) => (
            <ConceptItem key={concept.id} concept={concept} onFirstExpand={onExpose} />
          ))}
        </ul>
      </section>

      {relationGroups.length > 0 ? (
        <section aria-labelledby="related" className="space-y-4">
          <h2 id="related" className="text-lg font-semibold">
            Related services
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {relationGroups.map((group) => (
              <div key={group.label} className="space-y-2">
                <h3 className="text-sm font-semibold">{group.label}</h3>
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <li key={`${item.relation}-${item.service.slug}`} className="text-sm">
                      <Link
                        to={`/services/${item.service.slug}`}
                        className="font-medium underline underline-offset-4"
                      >
                        {item.service.name}
                      </Link>
                      {item.noteMd ? (
                        <span className="text-muted-foreground"> — {item.noteMd}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}

export function ServiceProfilePage() {
  const { id = '' } = useParams();
  const profile = useServiceProfile(id);
  const expose = useMarkConceptExposed(id);

  return (
    <QueryBoundary query={profile} loadingLabel="Loading service…">
      {(service) =>
        service ? (
          <Profile service={service} onExpose={(conceptId) => expose.mutate(conceptId)} />
        ) : (
          <NotFound />
        )
      }
    </QueryBoundary>
  );
}
