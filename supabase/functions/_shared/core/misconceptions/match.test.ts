import { matchMisconceptions, shouldResolve } from './match.ts';

const rubric = {
  knownMisconceptions: [
    { slug: 'sqs-push', statement: 'SQS pushes to consumers', correction: 'Consumers poll SQS' },
  ],
};
const item = (
  over: Partial<{ knownSlug: string | null; proposedSlug: string | null; statement: string }>,
) => ({
  knownSlug: null,
  proposedSlug: null,
  statement: 'Something wrong',
  correction: 'The right thing',
  ...over,
});

describe('misconception matching (known slug → existing → new)', () => {
  it('prefers the rubric entry for a known slug', () => {
    expect(
      matchMisconceptions(
        [item({ knownSlug: 'sqs-push', statement: 'It pushes' })],
        rubric,
        [],
        'answer',
      ),
    ).toEqual([
      {
        slug: 'sqs-push',
        statementMd: 'SQS pushes to consumers',
        correctionMd: 'Consumers poll SQS',
        existingId: null,
        excerpt: 'answer',
      },
    ]);
  });

  it('reuses an existing misconception by slug or by statement', () => {
    const existing = [
      {
        id: 'm1',
        slug: 'fifo-unlimited',
        statementMd: 'FIFO queues have unlimited throughput.',
        status: 'resolved' as const,
      },
    ];
    const [bySlug] = matchMisconceptions(
      [item({ proposedSlug: 'fifo-unlimited' })],
      rubric,
      existing,
      'a',
    );
    expect(bySlug).toMatchObject({
      slug: 'fifo-unlimited',
      existingId: 'm1',
      statementMd: 'FIFO queues have unlimited throughput.',
    });
    const [byStatement] = matchMisconceptions(
      [item({ proposedSlug: 'other-slug', statement: 'fifo queues have UNLIMITED throughput' })],
      rubric,
      existing,
      'a',
    );
    expect(byStatement).toMatchObject({ slug: 'fifo-unlimited', existingId: 'm1' });
  });

  it('creates new entries, collapses duplicates, and skips items without a slug', () => {
    const result = matchMisconceptions(
      [
        item({ proposedSlug: 'new-one' }),
        item({ proposedSlug: 'new-one', statement: 'again' }),
        item({ proposedSlug: null, statement: '' }),
      ],
      rubric,
      [],
      'x'.repeat(600),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ slug: 'new-one', existingId: null });
    expect(result[0]?.excerpt).toHaveLength(500);
  });
});

describe('resolution rule', () => {
  it('needs two consecutive cold passes since last seen and no re-diagnosis', () => {
    expect(
      shouldResolve({ consecutiveColdPasses: 2, coldPassesSinceLastSeen: 2, diagnosedNow: false }),
    ).toBe(true);
    expect(
      shouldResolve({ consecutiveColdPasses: 1, coldPassesSinceLastSeen: 2, diagnosedNow: false }),
    ).toBe(false);
    expect(
      shouldResolve({ consecutiveColdPasses: 3, coldPassesSinceLastSeen: 1, diagnosedNow: false }),
    ).toBe(false);
    expect(
      shouldResolve({ consecutiveColdPasses: 2, coldPassesSinceLastSeen: 2, diagnosedNow: true }),
    ).toBe(false);
  });
});
