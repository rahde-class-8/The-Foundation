import type {
  Citation,
  Concept,
  Facets,
  SearchPage,
  ServiceCard,
  ServiceProfile,
} from '../api/schemas';

let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

export function serviceCard(overrides: Partial<ServiceCard> = {}): ServiceCard {
  return {
    id: uuid(),
    slug: 'lambda',
    name: 'AWS Lambda',
    aliases: ['Lambda'],
    summaryMd: 'Serverless compute.',
    status: 'published',
    category: { id: '00000000-0000-4000-8000-0000000000c1', slug: 'compute', name: 'Compute' },
    conceptCount: 6,
    progress: { reviewingOrBetter: 2, studied: 3 },
    matchedConcepts: [],
    ...overrides,
  };
}

export function searchPage(items: ServiceCard[], nextCursor: string | null = null): SearchPage {
  return { items, nextCursor };
}

export function facets(): Facets {
  return {
    categories: [{ id: '00000000-0000-4000-8000-0000000000c1', slug: 'compute', name: 'Compute' }],
    certifications: [
      {
        id: '00000000-0000-4000-8000-0000000000e1',
        vendor: 'aws',
        code: 'SAA',
        examVersion: 'C03',
        name: 'Solutions Architect – Associate',
        domains: [
          {
            id: '00000000-0000-4000-8000-0000000000d1',
            code: 'D1',
            name: 'Design Secure Architectures',
            weightPct: 30,
          },
          {
            id: '00000000-0000-4000-8000-0000000000d2',
            code: 'D2',
            name: 'Design Resilient Architectures',
            weightPct: 26,
          },
        ],
      },
    ],
  };
}

export function citation(overrides: Partial<Citation> = {}): Citation {
  return {
    passageId: uuid(),
    supportType: 'defines',
    excerpt: 'The function timeout can be set up to 900 seconds.',
    excerptKind: 'paraphrase',
    sectionPath: 'Quotas',
    pageStart: null,
    pageEnd: null,
    source: {
      id: uuid(),
      title: 'Lambda quotas',
      url: 'https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html',
      sourceType: 'aws_documentation',
      trustTier: 'official',
      retrievedAt: null,
    },
    ...overrides,
  };
}

export function concept(overrides: Partial<Concept> = {}): Concept {
  return {
    id: uuid(),
    slug: 'execution-limits',
    title: 'Execution limits',
    summaryMd: 'Invocations run for at most 15 minutes.',
    explanationMd: 'The **timeout** is configurable up to 900 seconds.',
    examplesMd: 'Split long jobs with Step Functions.',
    limitationsMd: 'Memory does not extend the limit.',
    status: 'published',
    origin: 'curated',
    domains: [
      {
        id: uuid(),
        code: 'D3',
        name: 'Design High-Performing Architectures',
        certification: 'SAA-C03',
        relevance: 'core',
      },
    ],
    citations: [citation()],
    progress: null,
    questionCount: 1,
    ...overrides,
  };
}

export function serviceProfile(overrides: Partial<ServiceProfile> = {}): ServiceProfile {
  return {
    id: uuid(),
    slug: 'lambda',
    name: 'AWS Lambda',
    aliases: ['Lambda'],
    summaryMd: 'Serverless compute.',
    status: 'published',
    origin: 'curated',
    docsUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/welcome.html',
    category: { id: uuid(), slug: 'compute', name: 'Compute' },
    dimensions: {
      what: 'Serverless functions.',
      how: 'Execution environments.',
      problem: 'Idle servers.',
      solution: 'Managed scaling.',
      not_do: 'No jobs over 15 minutes.',
      when: 'Event-driven work.',
      where: null,
      trade_offs: 'Cold starts.',
    },
    concepts: [concept()],
    related: [
      {
        relation: 'alternative_to',
        noteMd: 'For long-running work.',
        service: { slug: 'ec2', name: 'Amazon EC2' },
      },
    ],
    ...overrides,
  };
}
