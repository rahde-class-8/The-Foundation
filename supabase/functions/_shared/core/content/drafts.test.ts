import { normalizeDrafts, PLACEHOLDER_PATTERN, type DraftOutput } from './drafts.ts';

const aliases = new Map([
  ['P1', '00000000-0000-4000-8000-000000000001'],
  ['P2', '00000000-0000-4000-8000-000000000002'],
]);
const question = {
  prompt: 'Why do queues help during traffic spikes?',
  dimension: 'problem' as const,
  difficulty: 2.4,
  referenceAnswer: 'They buffer work so consumers process it at their own pace.',
  rubricPoints: [
    { text: 'Queues buffer bursts of work', weight: 5, critical: true },
    { text: 'Consumers process at their own pace', weight: 0, critical: false },
  ],
};
const concept = (
  over: Partial<DraftOutput['concepts'][number]> = {},
): DraftOutput['concepts'][number] => ({
  title: 'Buffering with queues',
  summary: 'Queues absorb spikes.',
  explanation: 'A queue stores messages until consumers receive them.',
  limitations: '',
  citations: [
    { passage: 'P1', support: 'defines' },
    { passage: 'P1', support: 'defines' },
  ],
  questions: [question],
  ...over,
});

describe('normalizeDrafts', () => {
  it('maps passage aliases to ids, numbers rubric points, and clamps values', () => {
    const { drafts, rejected } = normalizeDrafts({ concepts: [concept()] }, aliases);
    expect(rejected).toEqual([]);
    expect(drafts[0]).toMatchObject({
      title: 'Buffering with queues',
      limitationsMd: null,
      citations: [{ passageId: '00000000-0000-4000-8000-000000000001', supportType: 'defines' }],
    });
    expect(drafts[0]?.questions[0]).toMatchObject({
      difficulty: 2,
      rubric: {
        points: [
          { id: 'p1', weight: 3, critical: true },
          { id: 'p2', weight: 1, critical: false },
        ],
      },
    });
  });

  it('rejects concepts citing passages that were not provided (citation ids ⊆ input ids)', () => {
    const { drafts, rejected } = normalizeDrafts(
      {
        concepts: [
          concept({ citations: [{ passage: 'P9', support: 'evidence' }] }),
          concept({ title: 'Kept' }),
        ],
      },
      aliases,
    );
    expect(drafts.map((d) => d.title)).toEqual(['Kept']);
    expect(rejected[0]?.reason).toContain('P9');
  });

  it('drops questions without a critical point and concepts without citations or questions', () => {
    const noCritical = { ...question, rubricPoints: [{ text: 'x', weight: 1, critical: false }] };
    const { drafts, rejected } = normalizeDrafts(
      {
        concepts: [
          concept({ questions: [noCritical] }),
          concept({ citations: [] }),
          concept({ summary: ' ' }),
        ],
      },
      aliases,
    );
    expect(drafts).toEqual([]);
    expect(rejected.map((r) => r.reason)).toEqual([
      expect.stringContaining('no usable question'),
      'has no citations',
      expect.stringContaining('missing'),
    ]);
  });

  it('keeps at most the requested number of concepts', () => {
    const output = { concepts: Array.from({ length: 8 }, (_, i) => concept({ title: `C${i}` })) };
    expect(normalizeDrafts(output, aliases, 3).drafts).toHaveLength(3);
    expect(normalizeDrafts(output, aliases, 50).drafts).toHaveLength(5);
  });

  it('flags placeholder text', () => {
    expect(PLACEHOLDER_PATTERN.test('Limit is TBD')).toBe(true);
    expect(PLACEHOLDER_PATTERN.test('See [[link]]')).toBe(true);
    expect(PLACEHOLDER_PATTERN.test('Fifteen minutes.')).toBe(false);
  });
});
