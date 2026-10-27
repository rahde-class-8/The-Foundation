import type { EvaluationResult } from '../grading/evaluation.ts';
import type { RubricV1 } from '../grading/rubric.ts';

export type ExistingMisconception = {
  id: string;
  slug: string;
  statementMd: string;
  status: 'active' | 'resolved';
};

export type MisconceptionMatch = {
  slug: string;
  statementMd: string;
  correctionMd: string;
  /** Set when the diagnosis matches a misconception the learner already has for this concept. */
  existingId: string | null;
  /** The learner's words (DATA_MODEL §4.3, ≤ 500 chars). */
  excerpt: string | null;
};

const squash = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Maps AI-diagnosed misconceptions to stable slugs (DATA_MODEL §4.3): a rubric's known slug first,
 * then an existing misconception (same slug or same statement), otherwise a new one.
 * Duplicates within one evaluation collapse to one occurrence.
 */
export function matchMisconceptions(
  diagnosed: EvaluationResult['misconceptions'],
  rubric: Pick<RubricV1, 'knownMisconceptions'>,
  existing: readonly ExistingMisconception[],
  answer: string,
): MisconceptionMatch[] {
  const known = new Map(rubric.knownMisconceptions.map((m) => [m.slug, m]));
  const bySlug = new Map(existing.map((m) => [m.slug, m]));
  const byStatement = new Map(existing.map((m) => [squash(m.statementMd), m]));
  const result = new Map<string, MisconceptionMatch>();

  for (const item of diagnosed) {
    const knownEntry = item.knownSlug ? known.get(item.knownSlug) : undefined;
    const candidateSlug = knownEntry?.slug ?? item.proposedSlug;
    const prior =
      (candidateSlug ? bySlug.get(candidateSlug) : undefined) ??
      byStatement.get(squash(item.statement));
    const slug = prior?.slug ?? candidateSlug;
    if (!slug || result.has(slug)) continue;
    result.set(slug, {
      slug,
      statementMd: knownEntry?.statement ?? prior?.statementMd ?? item.statement,
      correctionMd: knownEntry?.correction ?? item.correction,
      existingId: prior?.id ?? null,
      excerpt: answer.trim().slice(0, 500) || null,
    });
  }
  return [...result.values()];
}

/**
 * Resolution rule (DATA_MODEL §4.3): an active misconception resolves after two consecutive cold
 * passes on the concept with no re-diagnosis since it was last seen.
 */
export function shouldResolve(input: {
  consecutiveColdPasses: number;
  coldPassesSinceLastSeen: number;
  diagnosedNow: boolean;
}): boolean {
  return (
    !input.diagnosedNow && input.consecutiveColdPasses >= 2 && input.coldPassesSinceLastSeen >= 2
  );
}

/** A misconception is recurring once diagnosed on two or more distinct attempts (WB-6a). */
export const RECURRING_MIN_OCCURRENCES = 2;
