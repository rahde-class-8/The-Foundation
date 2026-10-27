import { z } from '../deps.ts';

/** Mastery dimensions a question probes (MASTERY_MODEL §1). */
export const DIMENSIONS = [
  'what',
  'how',
  'problem',
  'solution',
  'not_do',
  'when',
  'where',
  'trade_offs',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be lowercase-kebab-case');

/** Rubric schema version 1 (GRADING_RUBRICS §3). */
export const RubricV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    points: z
      .array(
        z.object({
          id: z.string().regex(/^p\d+$/, 'point ids look like p1, p2, …'),
          text: z.string().min(1).max(300),
          weight: z.number().int().min(1).max(3),
          critical: z.boolean(),
          acceptableVariants: z.array(z.string().min(1).max(200)).max(5).optional(),
        }),
      )
      .min(1)
      .max(8),
    knownMisconceptions: z
      .array(
        z.object({
          slug,
          statement: z.string().min(1).max(300),
          correction: z.string().min(1).max(500),
        }),
      )
      .max(6)
      .default([]),
    thresholds: z
      .object({ pass: z.number().min(0).max(1), partial: z.number().min(0).max(1) })
      .refine((t) => t.partial < t.pass, 'partial threshold must be below pass threshold')
      .default({ pass: 0.8, partial: 0.4 }),
  })
  .superRefine((rubric, ctx) => {
    if (!rubric.points.some((point) => point.critical)) {
      ctx.addIssue({
        code: 'custom',
        path: ['points'],
        message: 'at least one point must be critical',
      });
    }
    const ids = rubric.points.map((point) => point.id);
    const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
    if (duplicate) {
      ctx.addIssue({
        code: 'custom',
        path: ['points'],
        message: `duplicate point id ${duplicate}`,
      });
    }
  });

export type RubricV1 = z.infer<typeof RubricV1Schema>;
