import { Link } from 'react-router';
import { ReviewStatusBadge } from '@/components/common/ContentBadges';
import { Badge } from '@/components/ui/badge';
import type { ServiceCard } from '../api/schemas';
import { groupByCategory } from './grouping';
import { serviceProgressLabel } from './labels';

function ServiceCardItem({ service }: { service: ServiceCard }) {
  return (
    <li>
      <Link
        to={`/services/${service.slug}`}
        className="flex h-full flex-col gap-2 rounded-lg border p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{service.name}</span>
          {service.aliases.length > 0 ? (
            <span className="text-xs text-muted-foreground">{service.aliases.join(' · ')}</span>
          ) : null}
          <ReviewStatusBadge status={service.status} />
        </div>
        {service.summaryMd ? (
          <p className="text-sm text-muted-foreground">{service.summaryMd}</p>
        ) : null}
        {service.matchedConcepts.length > 0 ? (
          <div className="flex flex-wrap gap-1" aria-label="Matching concepts">
            {service.matchedConcepts.map((concept) => (
              <Badge key={concept.id} variant="secondary">
                {concept.title}
              </Badge>
            ))}
          </div>
        ) : null}
        <p className="mt-auto text-xs text-muted-foreground">
          {serviceProgressLabel(service.progress.reviewingOrBetter, service.conceptCount)} ·{' '}
          {service.progress.studied} studied
        </p>
      </Link>
    </li>
  );
}

export function ServiceResults({ services }: { services: ServiceCard[] }) {
  return (
    <div className="space-y-8">
      {groupByCategory(services).map((group) => (
        <section key={group.id} aria-labelledby={`category-${group.id}`} className="space-y-3">
          <h2
            id={`category-${group.id}`}
            className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {group.name}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {group.services.map((service) => (
              <ServiceCardItem key={service.id} service={service} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
