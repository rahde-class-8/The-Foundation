import { z } from '../deps.ts';
import { DIMENSIONS, RubricV1Schema, type RubricV1 } from '../grading/rubric.ts';

// AI-drafted concepts (CONTENT_GOVERNANCE §3, §5). The model cites passages by short aliases
// (P1, P2, …); normalizeDrafts maps them back and enforces citation ids ⊆ input ids.

export const MAX_DRAFT_PASSAGES = 20;
export const MAX_DRAFT_CONCEPTS = 5;
export const SUPPORT_TYPES = ['defines', 'example', 'limitation', 'evidence'] as const;

/** What the model returns: lenient on lengths so provider schema translation stays simple. */
export const DraftOutputSchema = z.object({
  concepts: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      explanation: z.string(),
      limitations: z.string().nullable(),
      citations: z.array(z.object({ passage: z.string(), support: z.enum(SUPPORT_TYPES) })),
      questions: z.array(
        z.object({
          prompt: z.string(),
          dimension: z.enum(DIMENSIONS),
          difficulty: z.number(),
          referenceAnswer: z.string(),
          rubricPoints: z.array(
            z.object({ text: z.string(), weight: z.number(), critical: z.boolean() }),
          ),
        }),
      ),
    }),
  ),
});
export type DraftOutput = z.infer<typeof DraftOutputSchema>;

export type DraftQuestion = {
  promptMd: string;
  dimension: (typeof DIMENSIONS)[number];
  difficulty: number;
  referenceAnswerMd: string;
  rubric: RubricV1;
};

export type DraftConcept = {
  title: string;
  summaryMd: string;
  explanationMd: string;
  limitationsMd: string | null;
  citations: { passageId: string; supportType: (typeof SUPPORT_TYPES)[number] }[];
  questions: DraftQuestion[];
};

export type NormalizedDrafts = {
  drafts: DraftConcept[];
  rejected: { title: string; reason: string }[];
};

const clip = (text: string, max: number) =>
  (text.length > max ? `${text.slice(0, max - 1)}…` : text).trim();

/** Validates and normalizes model output against the passages that were sent (CNT-7, CNT-9a). */
export function normalizeDrafts(
  output: DraftOutput,
  aliases: ReadonlyMap<string, string>,
  maxConcepts = MAX_DRAFT_CONCEPTS,
): NormalizedDrafts {
  const drafts: DraftConcept[] = [];
  const rejected: NormalizedDrafts['rejected'] = [];

  for (const concept of output.concepts.slice(0, Math.min(maxConcepts, MAX_DRAFT_CONCEPTS))) {
    const title = clip(concept.title, 200);
    const unknown = concept.citations.filter((c) => !aliases.has(c.passage));
    if (unknown.length > 0) {
      rejected.push({
        title,
        reason: `cites passages that were not provided: ${unknown.map((c) => c.passage).join(', ')}`,
      });
      continue;
    }
    const citations = [
      ...new Map(
        concept.citations.map((c) => [
          `${c.passage}:${c.support}`,
          { passageId: aliases.get(c.passage) ?? '', supportType: c.support },
        ]),
      ).values(),
    ].slice(0, 10);
    if (citations.length === 0) {
      rejected.push({ title, reason: 'has no citations' });
      continue;
    }

    const questions: DraftQuestion[] = [];
    for (const q of concept.questions.slice(0, 5)) {
      const rubric = RubricV1Schema.safeParse({
        schemaVersion: 1,
        points: q.rubricPoints.slice(0, 8).map((p, i) => ({
          id: `p${i + 1}`,
          text: clip(p.text, 300),
          weight: Math.min(3, Math.max(1, Math.round(p.weight))),
          critical: p.critical,
        })),
        knownMisconceptions: [],
      });
      if (!rubric.success || !q.prompt.trim() || !q.referenceAnswer.trim()) continue;
      questions.push({
        promptMd: clip(q.prompt, 2000),
        dimension: q.dimension,
        difficulty: Math.min(3, Math.max(1, Math.round(q.difficulty))),
        referenceAnswerMd: clip(q.referenceAnswer, 4000),
        rubric: rubric.data,
      });
    }
    if (!title || !concept.summary.trim() || !concept.explanation.trim()) {
      rejected.push({ title, reason: 'is missing a title, summary, or explanation' });
      continue;
    }
    if (questions.length === 0) {
      rejected.push({
        title,
        reason:
          'has no usable question (each needs a prompt, an answer, and a critical rubric point)',
      });
      continue;
    }
    drafts.push({
      title,
      summaryMd: clip(concept.summary, 600),
      explanationMd: clip(concept.explanation, 8000),
      limitationsMd: concept.limitations?.trim() ? clip(concept.limitations, 4000) : null,
      citations,
      questions,
    });
  }
  return { drafts, rejected };
}

/** Text that must be replaced before publishing (CONTENT_GOVERNANCE §3); mirrored in publish_concept. */
export const PLACEHOLDER_PATTERN = /\b(TODO|TBD|FIXME|XXX|lorem ipsum)\b|\[\[|\{\{/i;
