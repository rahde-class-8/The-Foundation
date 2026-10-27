import { rankQuestions, type QuestionCandidate, type RankContext } from './rank.ts';

const NOW = new Date('2026-10-27T16:00:00Z');
const context: RankContext = {
  scope: 'mixed',
  now: NOW,
  endOfToday: '2026-10-28T04:00:00.000Z',
  newConceptsRemaining: 10,
};

let n = 0;
function q(overrides: Partial<QuestionCandidate> = {}): QuestionCandidate {
  n += 1;
  return {
    questionId: `q${String(n).padStart(3, '0')}`,
    questionVersionId: `v${n}`,
    conceptId: `c${n}`,
    conceptTitle: `Concept ${n}`,
    serviceSlug: 'lambda',
    serviceName: 'AWS Lambda',
    promptMd: 'Prompt',
    dimension: 'what',
    difficulty: 2,
    review: null,
    lastAnsweredAt: null,
    dimensionAccuracy: null,
    conceptAttemptedInSession: false,
    ...overrides,
  };
}

const review = (overrides: Partial<NonNullable<QuestionCandidate['review']>> = {}) => ({
  masteryStatus: 'reviewing' as const,
  dueAt: '2026-11-05T04:00:00.000Z',
  ease: 2.5,
  lapseCount: 0,
  lastColdGrade: 'pass' as const,
  totalColdAttempts: 2,
  ...overrides,
});

describe('rankQuestions', () => {
  it('orders due reviews before weak, new, and other concepts', () => {
    const later = q({ conceptId: 'later', review: review() });
    const fresh = q({ conceptId: 'new' });
    const weak = q({
      conceptId: 'weak',
      review: review({ masteryStatus: 'lapsed', lastColdGrade: 'miss' }),
    });
    const due = q({ conceptId: 'due', review: review({ dueAt: '2026-10-27T04:00:00.000Z' }) });

    expect(rankQuestions([later, fresh, weak, due], context).map((x) => x.conceptId)).toEqual([
      'due',
      'weak',
      'new',
      'later',
    ]);
  });

  it('ranks due reviews by priority: lapsed and missed first', () => {
    const due = (id: string, extra: Partial<NonNullable<QuestionCandidate['review']>>) =>
      q({
        conceptId: id,
        serviceSlug: id,
        review: review({ dueAt: '2026-10-27T04:00:00.000Z', ...extra }),
      });

    const ranked = rankQuestions(
      [due('ok', {}), due('lapsed', { masteryStatus: 'lapsed', lastColdGrade: 'miss' })],
      context,
    );

    expect(ranked.map((x) => x.conceptId)).toEqual(['lapsed', 'ok']);
  });

  it('asks one question per concept, preferring the weakest dimension', () => {
    const strong = q({ conceptId: 'c', dimension: 'what', dimensionAccuracy: 1 });
    const weak = q({ conceptId: 'c', dimension: 'not_do', dimensionAccuracy: 0 });

    expect(rankQuestions([strong, weak], context)).toEqual([weak]);
  });

  it('skips concepts already attempted in the session, except in concept scope', () => {
    const attempted = q({ conceptAttemptedInSession: true });

    expect(rankQuestions([attempted], context)).toEqual([]);
    expect(rankQuestions([attempted], { ...context, scope: 'concept' })).toEqual([attempted]);
  });

  it('caps new concepts at the remaining daily limit', () => {
    const fresh = [q(), q(), q()];

    expect(rankQuestions(fresh, { ...context, newConceptsRemaining: 2 })).toHaveLength(2);
  });

  it('interleaves services within the same bucket', () => {
    const items = [
      q({ serviceSlug: 'lambda' }),
      q({ serviceSlug: 'lambda' }),
      q({ serviceSlug: 's3' }),
    ];

    expect(rankQuestions(items, context).map((x) => x.serviceSlug)).toEqual([
      'lambda',
      's3',
      'lambda',
    ]);
  });
});
