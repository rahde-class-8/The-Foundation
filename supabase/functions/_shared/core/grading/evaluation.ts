import { z } from '../deps.ts';
import type { RubricV1 } from './rubric.ts';

export const GRADES = ['pass', 'partial', 'miss'] as const;
export type Grade = (typeof GRADES)[number];
export const VERDICTS = ['covered', 'partial', 'missing', 'contradicted'] as const;
export type Verdict = (typeof VERDICTS)[number];

/**
 * What the model is asked to return (GRADING_RUBRICS §4). Deliberately lenient (no length limits)
 * so provider-side schema translation stays simple; `normalizeEvaluation` enforces the limits.
 */
export const EvaluationOutputSchema = z.object({
  pointJudgements: z.array(
    z.object({
      pointId: z.string(),
      verdict: z.enum(VERDICTS),
      evidenceQuote: z.string().nullable(),
    }),
  ),
  incorrectStatements: z.array(
    z.object({
      quote: z.string(),
      whyIncorrect: z.string(),
      severity: z.enum(['minor', 'major']),
      relatedPointId: z.string().nullable(),
    }),
  ),
  misconceptions: z.array(
    z.object({
      knownSlug: z.string().nullable(),
      proposedSlug: z.string().nullable(),
      statement: z.string(),
      correction: z.string(),
    }),
  ),
  missingSummary: z.string(),
  feedbackMd: z.string(),
  correctionPrompt: z.string().nullable(),
  suggestedGrade: z.enum(GRADES),
  confidence: z.number(),
});
export type EvaluationOutput = z.infer<typeof EvaluationOutputSchema>;

/** The normalized document stored in evaluations.feedback (schemaVersion 1). */
export const EvaluationResultSchema = z.object({
  schemaVersion: z.literal(1),
  pointJudgements: z.array(
    z.object({
      pointId: z.string(),
      verdict: z.enum(VERDICTS),
      evidenceQuote: z.string().max(300).nullable(),
    }),
  ),
  incorrectStatements: z
    .array(
      z.object({
        quote: z.string().max(300),
        whyIncorrect: z.string().max(500),
        severity: z.enum(['minor', 'major']),
        relatedPointId: z.string().nullable(),
      }),
    )
    .max(10),
  misconceptions: z
    .array(
      z.object({
        knownSlug: z.string().nullable(),
        proposedSlug: z
          .string()
          .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
          .nullable(),
        statement: z.string().max(300),
        correction: z.string().max(500),
      }),
    )
    .max(5),
  missingSummary: z.string().max(800),
  feedbackMd: z.string().max(2000),
  correctionPrompt: z.string().max(400).nullable(),
  suggestedGrade: z.enum(GRADES),
  confidence: z.number().min(0).max(1),
});
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

const squash = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
const cut = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;
const toSlug = (text: string | null) => {
  if (!text) return null;
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug.length > 0 ? slug : null;
};

/**
 * Post-validation (GRADING_RUBRICS §4): exactly one judgement per rubric point (missing ones become
 * `missing`), unknown point ids dropped, evidence quotes kept only if they appear in the answer.
 */
export function normalizeEvaluation(
  output: EvaluationOutput,
  rubric: RubricV1,
  answer: string,
): EvaluationResult {
  const answerText = squash(answer);
  const pointIds = new Set(rubric.points.map((point) => point.id));
  const knownSlugs = new Set(rubric.knownMisconceptions.map((m) => m.slug));
  const byPoint = new Map<string, EvaluationOutput['pointJudgements'][number]>();
  for (const judgement of output.pointJudgements) {
    if (pointIds.has(judgement.pointId) && !byPoint.has(judgement.pointId))
      byPoint.set(judgement.pointId, judgement);
  }

  return EvaluationResultSchema.parse({
    schemaVersion: 1,
    pointJudgements: rubric.points.map((point) => {
      const judgement = byPoint.get(point.id);
      const quote = judgement?.evidenceQuote?.trim() ?? null;
      return {
        pointId: point.id,
        verdict: judgement?.verdict ?? 'missing',
        evidenceQuote: quote && answerText.includes(squash(quote)) ? cut(quote, 300) : null,
      };
    }),
    incorrectStatements: output.incorrectStatements.slice(0, 10).map((statement) => ({
      quote: cut(statement.quote, 300),
      whyIncorrect: cut(statement.whyIncorrect, 500),
      severity: statement.severity,
      relatedPointId:
        statement.relatedPointId && pointIds.has(statement.relatedPointId)
          ? statement.relatedPointId
          : null,
    })),
    misconceptions: output.misconceptions.slice(0, 5).map((m) => ({
      knownSlug: m.knownSlug && knownSlugs.has(m.knownSlug) ? m.knownSlug : null,
      proposedSlug:
        m.knownSlug && knownSlugs.has(m.knownSlug) ? null : toSlug(m.proposedSlug ?? m.statement),
      statement: cut(m.statement, 300),
      correction: cut(m.correction, 500),
    })),
    missingSummary: cut(output.missingSummary, 800),
    feedbackMd: cut(output.feedbackMd, 2000),
    correctionPrompt: output.correctionPrompt ? cut(output.correctionPrompt, 400) : null,
    suggestedGrade: output.suggestedGrade,
    confidence: Math.min(
      1,
      Math.max(0, Number.isFinite(output.confidence) ? output.confidence : 0),
    ),
  });
}
