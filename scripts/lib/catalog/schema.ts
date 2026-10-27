// Schema for the curated catalog in content/catalog (ADR-0007, CONTENT_GOVERNANCE).
import { z } from 'zod';
import {
  DIMENSIONS,
  RubricV1Schema,
} from '../../../supabase/functions/_shared/core/grading/rubric.ts';

export const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be lowercase-kebab-case')
  .max(80);
const status = z.enum(['draft', 'in_review', 'published', 'retired']);
const origin = z.enum(['curated', 'ai_draft', 'manual']);
const httpsUrl = z.url({ protocol: /^https$/ });
const markdown = (max: number) => z.string().trim().min(1).max(max);

/** Who approved AI-drafted content for publication (CONTENT_GOVERNANCE §3). Kept in git, not the DB. */
const review = z.object({ by: z.string().min(1), at: z.iso.date() });

export const CategoriesFileSchema = z.object({
  categories: z
    .array(z.object({ slug, name: z.string().min(1).max(100), sortOrder: z.number().int() }))
    .min(1),
});

export const SourcesFileSchema = z.object({
  sources: z
    .array(
      z.object({
        key: slug,
        type: z.enum(['aws_documentation', 'aws_whitepaper', 'aws_faq', 'curated']),
        title: z.string().min(1).max(300),
        url: httpsUrl.optional(),
        // Date the page was last checked against the excerpts that cite it. Omitted = unverified.
        retrievedAt: z.iso.date().optional(),
      }),
    )
    .min(1),
});

export const CertificationFileSchema = z.object({
  vendor: z.enum(['aws', 'gcp', 'azure']),
  code: z.string().regex(/^[A-Z0-9-]{2,20}$/),
  examVersion: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  status: z.enum(['active', 'retired']).default('active'),
  examGuideUrl: httpsUrl.optional(),
  domains: z
    .array(
      z.object({
        code: z.string().regex(/^[A-Z0-9-]{1,10}$/),
        name: z.string().min(1).max(200),
        weightPct: z.number().min(0).max(100),
      }),
    )
    .min(1),
});

const citation = z.object({
  source: slug,
  section: z.string().min(1).max(300).optional(),
  excerpt: z.string().trim().min(1).max(4000),
  // 'paraphrase' marks a summary that must not be presented as a quotation.
  excerptKind: z.enum(['verbatim', 'paraphrase']),
  supports: z.enum(['defines', 'example', 'limitation', 'evidence']),
});

const mapping = z.object({
  certification: z
    .string()
    .regex(/^[a-z]+\/[A-Z0-9-]+\/[A-Za-z0-9.-]+$/, 'use vendor/CODE/version, e.g. aws/SAA/C03'),
  domain: z.string().regex(/^[A-Z0-9-]{1,10}$/),
  relevance: z.enum(['core', 'supporting']).default('core'),
});

const question = z.object({
  key: slug,
  dimension: z.enum(DIMENSIONS),
  difficulty: z.number().int().min(1).max(3).default(2),
  status: status.optional(),
  origin: origin.optional(),
  review: review.optional(),
  prompt: markdown(2000),
  referenceAnswer: markdown(4000),
  rubric: RubricV1Schema,
});

const concept = z.object({
  slug,
  title: z.string().min(1).max(200),
  status: status.optional(),
  origin: origin.optional(),
  review: review.optional(),
  summary: markdown(600),
  explanation: markdown(8000),
  examples: markdown(4000).optional(),
  limitations: markdown(4000).optional(),
  mappings: z.array(mapping).min(1, 'map the concept to at least one exam domain'),
  citations: z.array(citation).min(1, 'at least one citation is required'),
  questions: z.array(question).default([]),
});

export const ServiceFileSchema = z.object({
  provider: z.enum(['aws', 'gcp', 'azure']).default('aws'),
  slug,
  name: z.string().min(1).max(200),
  aliases: z.array(z.string().min(1).max(60)).default([]),
  category: slug,
  // Defaults for concepts and questions in this file.
  status,
  origin,
  review: review.optional(),
  docsUrl: httpsUrl.optional(),
  summary: markdown(600),
  dimensions: z
    .object({
      what: markdown(4000),
      how: markdown(4000),
      problem: markdown(4000),
      solution: markdown(4000),
      not_do: markdown(4000),
      when: markdown(4000),
      where: markdown(4000),
      trade_offs: markdown(4000),
    })
    .partial(),
  related: z
    .array(
      z.object({
        service: slug,
        relation: z.enum([
          'alternative_to',
          'commonly_paired_with',
          'prerequisite_for',
          'often_confused_with',
        ]),
        note: z.string().min(1).max(1000).optional(),
      }),
    )
    .default([]),
  concepts: z.array(concept).min(1),
});

export type CategoriesFile = z.infer<typeof CategoriesFileSchema>;
export type SourcesFile = z.infer<typeof SourcesFileSchema>;
export type CertificationFile = z.infer<typeof CertificationFileSchema>;
export type ServiceFile = z.infer<typeof ServiceFileSchema>;
