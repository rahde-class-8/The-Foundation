import type { Dimension } from '../grading/rubric.ts';
import type { MasteryStatus } from '../scheduler/next.ts';
import { priorityScore } from '../scheduler/priority.ts';

export type SessionScope = 'service' | 'concept' | 'domain' | 'due_reviews' | 'weak' | 'mixed';

export type QuestionCandidate = {
  questionId: string;
  questionVersionId: string;
  conceptId: string;
  conceptTitle: string;
  serviceSlug: string;
  serviceName: string;
  promptMd: string;
  dimension: Dimension;
  difficulty: number;
  review: {
    masteryStatus: MasteryStatus;
    dueAt: string | null;
    ease: number;
    lapseCount: number;
    lastColdGrade: 'pass' | 'partial' | 'miss' | null;
    totalColdAttempts: number;
  } | null;
  lastAnsweredAt: string | null;
  dimensionAccuracy: number | null;
  conceptAttemptedInSession: boolean;
};

export type RankContext = {
  scope: SessionScope;
  now: Date;
  /** End of the learner's local day (ISO); reviews due before it count as due today. */
  endOfToday: string;
  newConceptsRemaining: number;
};

const BAND: Record<MasteryStatus, [number, number]> = {
  new: [1, 2],
  learning: [1, 2],
  lapsed: [1, 2],
  reviewing: [2, 2],
  mastered: [2, 3],
};

function bestQuestion(questions: QuestionCandidate[]): QuestionCandidate {
  const status = questions[0]?.review?.masteryStatus ?? 'new';
  const [low, high] = BAND[status];
  return [...questions].sort((a, b) => {
    // Weakest dimension first (unseen counts as 0.5), then out-of-band last, then least recently answered.
    const accuracy = (a.dimensionAccuracy ?? 0.5) - (b.dimensionAccuracy ?? 0.5);
    if (accuracy !== 0) return accuracy;
    const inBand = (q: QuestionCandidate) => (q.difficulty >= low && q.difficulty <= high ? 0 : 1);
    if (inBand(a) !== inBand(b)) return inBand(a) - inBand(b);
    const answered = (a.lastAnsweredAt ?? '').localeCompare(b.lastAnsweredAt ?? '');
    if (answered !== 0) return answered;
    return a.questionId.localeCompare(b.questionId);
  })[0] as QuestionCandidate;
}

type Bucketed = { question: QuestionCandidate; bucket: number; score: number; tiebreak: string };

/**
 * Orders the next questions for a session (MASTERY_MODEL §5): one question per concept (except in
 * concept scope), due → weak → new (capped) → the rest, then interleaved so consecutive questions
 * come from different services where possible.
 */
export function rankQuestions(
  candidates: QuestionCandidate[],
  context: RankContext,
): QuestionCandidate[] {
  const pool =
    context.scope === 'concept'
      ? candidates
      : candidates.filter((q) => !q.conceptAttemptedInSession);
  const byConcept = new Map<string, QuestionCandidate[]>();
  for (const question of pool) {
    const list = byConcept.get(question.conceptId) ?? [];
    list.push(question);
    byConcept.set(question.conceptId, list);
  }

  const chosen: QuestionCandidate[] =
    context.scope === 'concept'
      ? [...pool].sort(
          (a, b) =>
            (a.lastAnsweredAt ?? '').localeCompare(b.lastAnsweredAt ?? '') ||
            a.questionId.localeCompare(b.questionId),
        )
      : [...byConcept.values()].map(bestQuestion);

  let newBudget = context.newConceptsRemaining;
  const bucketed: Bucketed[] = [];
  for (const question of chosen) {
    const review = question.review;
    const isNew = !review || (review.totalColdAttempts === 0 && review.masteryStatus === 'new');
    const due = review?.dueAt != null && review.dueAt < context.endOfToday;
    const weak =
      review != null &&
      review.totalColdAttempts > 0 &&
      (review.masteryStatus === 'lapsed' || review.masteryStatus === 'learning');
    let bucket: number;
    if (due) bucket = 0;
    else if (weak) bucket = 1;
    else if (isNew) {
      if (newBudget <= 0) continue;
      newBudget -= 1;
      bucket = 2;
    } else bucket = 3;
    const score = review ? priorityScore(review, context.now) : 0;
    bucketed.push({
      question,
      bucket,
      score,
      tiebreak: `${review?.dueAt ?? '9999'}|${question.conceptId}`,
    });
  }

  bucketed.sort(
    (a, b) => a.bucket - b.bucket || b.score - a.score || a.tiebreak.localeCompare(b.tiebreak),
  );

  // Interleave services within each bucket: take the first item of the current bucket whose service
  // differs from the previous question's, so due reviews still come before new concepts.
  const ordered: QuestionCandidate[] = [];
  const remaining = [...bucketed];
  while (remaining.length > 0) {
    const previous = ordered.at(-1)?.serviceSlug;
    const bucket = remaining[0]?.bucket;
    const index = remaining.findIndex(
      (item) => item.bucket === bucket && item.question.serviceSlug !== previous,
    );
    const [next] = remaining.splice(index === -1 ? 0 : index, 1);
    if (next) ordered.push(next.question);
  }
  return ordered;
}
