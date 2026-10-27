import { z } from 'zod';

// Response shapes of the catalog RPCs (API_CONTRACTS §3), validated at the boundary.

const contentStatus = z.enum(['draft', 'in_review', 'published', 'retired']);
const masteryStatus = z.enum(['new', 'learning', 'reviewing', 'mastered', 'lapsed']);

export const ServiceCardSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  summaryMd: z.string().nullable(),
  status: contentStatus,
  category: z.object({ id: z.uuid(), slug: z.string(), name: z.string() }),
  conceptCount: z.number().int(),
  progress: z.object({ reviewingOrBetter: z.number().int(), studied: z.number().int() }),
  matchedConcepts: z.array(z.object({ id: z.uuid(), slug: z.string(), title: z.string() })),
});

export const SearchPageSchema = z.object({
  items: z.array(ServiceCardSchema),
  nextCursor: z.string().nullable(),
});

export const FacetsSchema = z.object({
  categories: z.array(z.object({ id: z.uuid(), slug: z.string(), name: z.string() })),
  certifications: z.array(
    z.object({
      id: z.uuid(),
      vendor: z.string(),
      code: z.string(),
      examVersion: z.string(),
      name: z.string(),
      domains: z.array(
        z.object({
          id: z.uuid(),
          code: z.string(),
          name: z.string(),
          weightPct: z.number().nullable(),
        }),
      ),
    }),
  ),
});

export const DIMENSION_KEYS = [
  'what',
  'how',
  'problem',
  'solution',
  'not_do',
  'when',
  'where',
  'trade_offs',
] as const;

const CitationSchema = z.object({
  passageId: z.uuid(),
  supportType: z.enum(['defines', 'example', 'limitation', 'evidence']),
  excerpt: z.string(),
  excerptKind: z.enum(['verbatim', 'paraphrase']),
  sectionPath: z.string().nullable(),
  pageStart: z.number().int().nullable(),
  pageEnd: z.number().int().nullable(),
  source: z.object({
    id: z.uuid(),
    title: z.string(),
    url: z.string().nullable(),
    sourceType: z.string(),
    trustTier: z.enum(['official', 'curated', 'personal']),
    retrievedAt: z.string().nullable(),
  }),
});

export const ConceptSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  summaryMd: z.string().nullable(),
  explanationMd: z.string().nullable(),
  examplesMd: z.string().nullable(),
  limitationsMd: z.string().nullable(),
  status: contentStatus,
  origin: z.enum(['curated', 'ai_draft', 'manual']),
  domains: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      name: z.string(),
      certification: z.string(),
      relevance: z.enum(['core', 'supporting']),
    }),
  ),
  citations: z.array(CitationSchema),
  progress: z.object({ masteryStatus, firstStudiedAt: z.string().nullable() }).nullable(),
  questionCount: z.number().int(),
});

export const ServiceProfileSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  summaryMd: z.string().nullable(),
  status: contentStatus,
  origin: z.enum(['curated', 'ai_draft', 'manual']),
  docsUrl: z.string().nullable(),
  category: z.object({ id: z.uuid(), slug: z.string(), name: z.string() }),
  dimensions: z.record(z.enum(DIMENSION_KEYS), z.string().nullable()),
  concepts: z.array(ConceptSchema),
  related: z.array(
    z.object({
      relation: z.enum([
        'alternative_to',
        'commonly_paired_with',
        'prerequisite_for',
        'often_confused_with',
      ]),
      noteMd: z.string().nullable(),
      service: z.object({ slug: z.string(), name: z.string() }),
    }),
  ),
});

export type ServiceCard = z.infer<typeof ServiceCardSchema>;
export type SearchPage = z.infer<typeof SearchPageSchema>;
export type Facets = z.infer<typeof FacetsSchema>;
export type Concept = z.infer<typeof ConceptSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type ServiceProfile = z.infer<typeof ServiceProfileSchema>;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];
