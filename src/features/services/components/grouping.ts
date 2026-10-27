import type { ServiceCard } from '../api/schemas';

export type CategoryGroup = { id: string; name: string; services: ServiceCard[] };

/** Groups consecutive services by category (results arrive ordered by category). */
export function groupByCategory(services: ServiceCard[]): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  for (const service of services) {
    const last = groups.at(-1);
    if (last && last.id === service.category.id) last.services.push(service);
    else groups.push({ id: service.category.id, name: service.category.name, services: [service] });
  }
  return groups;
}
