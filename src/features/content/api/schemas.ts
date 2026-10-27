import { z } from 'zod';
import { JobViewSchema } from '@core/contracts/content.ts';

const tier = z.enum(['official', 'curated', 'personal']);

export const OverviewSchema = z.object({
  isOwner: z.boolean(),
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      sourceType: z.enum(['user_note', 'user_upload']),
      trustTier: tier,
      status: z.enum(['pending', 'ready', 'failed', 'archived']),
      byteSize: z.number().nullable(),
      pageCount: z.number().nullable(),
      createdAt: z.string(),
      passageCount: z.number(),
      job: JobViewSchema.nullable(),
    }),
  ),
  drafts: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      serviceName: z.string(),
      serviceSlug: z.string(),
      createdAt: z.string(),
      questionCount: z.number(),
      citationCount: z.number(),
    }),
  ),
  stale: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string().nullable(),
      sourceType: z.string(),
      retrievedAt: z.string().nullable(),
      conceptCount: z.number(),
    }),
  ),
});
export type Overview = z.infer<typeof OverviewSchema>;
export type SourceRow = Overview['sources'][number];

export const PassagesSchema = z.array(
  z.object({
    id: z.string(),
    ordinal: z.number(),
    text: z.string(),
    pageStart: z.number().nullable(),
    pageEnd: z.number().nullable(),
    sectionPath: z.string().nullable(),
    sourceId: z.string(),
    sourceTitle: z.string(),
    sourceType: z.string(),
    trustTier: tier,
  }),
);
export type PassageRow = z.infer<typeof PassagesSchema>[number];

const point = z.object({
  id: z.string(),
  text: z.string(),
  weight: z.number(),
  critical: z.boolean(),
});

export const DraftSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  origin: z.string(),
  summaryMd: z.string().nullable(),
  explanationMd: z.string().nullable(),
  limitationsMd: z.string().nullable(),
  revision: z.number(),
  service: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
  domainIds: z.array(z.string()),
  citations: z.array(
    z.object({
      passageId: z.string(),
      supportType: z.string(),
      text: z.string(),
      pageStart: z.number().nullable(),
      pageEnd: z.number().nullable(),
      sectionPath: z.string().nullable(),
      sourceTitle: z.string(),
      sourceType: z.string(),
      trustTier: tier,
    }),
  ),
  questions: z.array(
    z.object({
      id: z.string(),
      dimension: z.string(),
      difficulty: z.number(),
      status: z.string(),
      version: z.number(),
      promptMd: z.string(),
      referenceAnswerMd: z.string(),
      rubric: z.object({ points: z.array(point) }).passthrough(),
    }),
  ),
});
export type Draft = z.infer<typeof DraftSchema>;
export type DraftQuestion = Draft['questions'][number];

export const FacetsSchema = z
  .object({
    certifications: z.array(
      z
        .object({
          id: z.string(),
          code: z.string(),
          examVersion: z.string().optional(),
          domains: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
        })
        .passthrough(),
    ),
  })
  .passthrough();
