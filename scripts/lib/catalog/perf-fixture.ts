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

/**
 * A small, published, fully verified service for practice tests (CI only). Its rubric points use
 * plain keywords so the mock grader can match them.
 */
export function withPracticeFixture(catalog: Catalog): Catalog {
  const cert = catalog.certifications[0];
  const domain = cert?.domains[0];
  if (!cert || !domain)
    throw new Error('The practice fixture needs at least one certification with a domain.');
  const mapping = {
    certification: `${cert.vendor}/${cert.code}/${cert.examVersion}`,
    domain: domain.code,
    relevance: 'core' as const,
  };
  // A second domain, when the certification has one, gives the Weak Box tests two domains.
  const secondDomain = cert.domains[1] ?? domain;
  const secondMapping = { ...mapping, domain: secondDomain.code };
  const question = (
    key: string,
    prompt: string,
    points: [string, string],
    dimension: 'what' | 'when' = 'what',
  ) => ({
    key,
    dimension,
    difficulty: 2,
    prompt,
    referenceAnswer: `${points[0]}. ${points[1]}.`,
    rubric: {
      schemaVersion: 1 as const,
      points: [
        { id: 'p1', text: points[0], weight: 3, critical: true },
        { id: 'p2', text: points[1], weight: 2, critical: true },
      ],
      knownMisconceptions: [],
      thresholds: { pass: 0.8, partial: 0.4 },
    },
  });

  return {
    ...catalog,
    sources: [
      ...catalog.sources,
      {
        key: 'practice-fixture-source',
        type: 'aws_documentation',
        title: 'Practice fixture source',
        url: 'https://docs.aws.amazon.com/',
        retrievedAt: '2026-10-01',
      },
    ],
    services: [
      ...catalog.services,
      {
        path: 'practice-fixture',
        provider: 'aws',
        slug: 'practice-fixture',
        name: 'Practice Fixture Service',
        aliases: [],
        category: catalog.categories[0]?.slug ?? 'compute',
        status: 'published',
        origin: 'manual',
        summary: 'Synthetic published service used by practice tests.',
        dimensions: {},
        related: [],
        concepts: [
          {
            slug: 'queues',
            title: 'Queues',
            summary: 'Queues decouple producers from consumers.',
            explanation: 'Synthetic explanation.',
            mappings: [mapping],
            citations: [
              {
                source: 'practice-fixture-source',
                excerpt: 'Queues decouple producers from consumers.',
                excerptKind: 'verbatim',
                supports: 'defines',
              },
            ],
            questions: [
              question('queue-purpose', 'What problem does a queue solve?', [
                'Queues decouple producers from consumers',
                'Buffering absorbs traffic spikes',
              ]),
            ],
          },
          {
            slug: 'topics',
            title: 'Topics',
            summary: 'Topics push messages to every subscriber.',
            explanation: 'Synthetic explanation.',
            mappings: [mapping],
            citations: [
              {
                source: 'practice-fixture-source',
                excerpt: 'Topics push messages to subscribers.',
                excerptKind: 'verbatim',
                supports: 'defines',
              },
            ],
            questions: [
              question('topic-delivery', 'How does a topic deliver messages?', [
                'Topics push every message to subscribers',
                'Subscribers never poll topics',
              ]),
            ],
          },
          {
            slug: 'streams',
            title: 'Streams',
            summary: 'Streams keep ordered records for replay.',
            explanation: 'Synthetic explanation.',
            mappings: [secondMapping],
            citations: [
              {
                source: 'practice-fixture-source',
                excerpt: 'Streams keep ordered records.',
                excerptKind: 'verbatim',
                supports: 'defines',
              },
            ],
            questions: [
              question(
                'stream-use',
                'When would you choose a stream over a queue?',
                ['Streams keep records ordered for replay', 'Many consumers read the same records'],
                'when',
              ),
            ],
          },
        ],
      },
    ],
  };
}
