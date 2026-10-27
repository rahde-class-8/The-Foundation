import type { Catalog } from './load.ts';

/** Synthetic services for the catalog performance check (P1-4). Never part of the real catalog. */
export function withPerfFixture(catalog: Catalog, services = 25, conceptsPerService = 10): Catalog {
  const cert = catalog.certifications[0];
  const domain = cert?.domains[0];
  if (!cert || !domain)
    throw new Error('The perf fixture needs at least one certification with a domain.');

  return {
    ...catalog,
    categories: [
      ...catalog.categories,
      { slug: 'perf-fixture', name: 'Perf fixture', sortOrder: 999 },
    ],
    sources: [
      ...catalog.sources,
      { key: 'perf-fixture-source', type: 'curated', title: 'Perf fixture source' },
    ],
    services: [
      ...catalog.services,
      ...Array.from({ length: services }, (_, s) => ({
        path: `perf-fixture/service-${s + 1}`,
        provider: 'aws' as const,
        slug: `perf-service-${s + 1}`,
        name: `Perf Service ${String(s + 1).padStart(2, '0')}`,
        aliases: [],
        category: 'perf-fixture',
        status: 'published' as const,
        origin: 'manual' as const,
        summary: 'Synthetic service used to measure catalog rendering.',
        dimensions: {},
        related: [],
        concepts: Array.from({ length: conceptsPerService }, (_, c) => ({
          slug: `concept-${c + 1}`,
          title: `Synthetic concept ${c + 1}`,
          summary: 'Synthetic concept.',
          explanation: 'Synthetic explanation.',
          mappings: [
            {
              certification: `${cert.vendor}/${cert.code}/${cert.examVersion}`,
              domain: domain.code,
              relevance: 'core' as const,
            },
          ],
          citations: [
            {
              source: 'perf-fixture-source',
              excerpt: `Synthetic excerpt ${s + 1}.${c + 1}`,
              excerptKind: 'paraphrase' as const,
              supports: 'defines' as const,
            },
          ],
          questions: [],
        })),
      })),
    ],
  };
}
