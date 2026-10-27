import { OverrideResponseSchema } from '@core/contracts/reviews.ts';
import {
  FIXTURE_ANSWERS,
  createLearner,
  days,
  fixtureConcepts,
  invoke,
  rpc,
  setClock,
  type Learner,
} from '../support/learners.ts';

// Weak Box over the API with throwaway learners and their test clocks (WB-1, WB-3, WB-6, P3-4).
const runIntegration = Boolean(process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD);

async function practice(learner: Learner, concept: string, answer: string) {
  const concepts = await fixtureConcepts(learner.client);
  const session = await rpc<{ id: string }>(learner.client, 'start_session', {
    scope_type: 'concept',
    scope_id: concepts[concept],
  });
  const next = await rpc<{ candidates: { questionVersionId: string }[] }>(
    learner.client,
    'next_questions',
    {
      session_id: session.id,
    },
  );
  const attempt = await rpc<{ id: string; isCold: boolean }>(learner.client, 'submit_attempt', {
    session_id: session.id,
    question_version_id: next.candidates[0]?.questionVersionId,
    answer_md: answer,
    client_key: crypto.randomUUID(),
  });
  const { evaluation } = await invoke<{ evaluation: { id: string; grade: string } }>(
    learner.client,
    'evaluate-attempt',
    {
      attemptId: attempt.id,
    },
  );
  await invoke(learner.client, 'finalize-attempt', {
    attemptId: attempt.id,
    finalEvaluationId: evaluation.id,
  });
  return { attempt, grade: evaluation.grade, conceptId: concepts[concept] ?? '' };
}

type Due = {
  counts: Record<string, number>;
  items: { conceptId: string; version: number; dueAt: string }[];
};

describe.runIf(runIntegration)('Weak Box over the API', () => {
  it('brings a missed concept back the next day and a passed one after three days (DoD 8–9)', async () => {
    const learner = await createLearner();
    const { conceptId, grade } = await practice(
      learner,
      'queues',
      FIXTURE_ANSWERS.queues?.miss ?? '',
    );
    expect(grade).toBe('miss');
    expect(
      (await rpc<Due>(learner.client, 'due_reviews', { due_window: 'upcoming' })).items.map(
        (i) => i.conceptId,
      ),
    ).toEqual([conceptId]);

    await setClock(learner.id, days(1));
    const today = await rpc<Due>(learner.client, 'due_reviews', { due_window: 'today' });
    expect(today.items.map((i) => i.conceptId)).toEqual([conceptId]);

    const second = await practice(learner, 'queues', FIXTURE_ANSWERS.queues?.pass ?? '');
    expect(second.attempt.isCold).toBe(true);
    expect(second.grade).toBe('pass');

    await setClock(learner.id, days(4));
    expect(
      (await rpc<Due>(learner.client, 'due_reviews', { due_window: 'today' })).items,
    ).toHaveLength(1);
  });

  it('flags a misconception seen on two attempts as recurring (WB-6a)', async () => {
    const learner = await createLearner();
    await practice(learner, 'topics', 'Not sure [[mock:misconception:push-model]]');
    expect(await rpc<unknown[]>(learner.client, 'recurring_misconceptions')).toHaveLength(0);

    await setClock(learner.id, days(1));
    await practice(learner, 'topics', 'Still not sure [[mock:misconception:push-model]]');

    const recurring = await rpc<{ slug: string; occurrenceCount: number; recurring: boolean }[]>(
      learner.client,
      'recurring_misconceptions',
    );
    expect(recurring).toEqual([
      expect.objectContaining({ slug: 'push-model', occurrenceCount: 2, recurring: true }),
    ]);
    const scopes = await rpc<{ weakCount: number }>(learner.client, 'practice_scopes');
    expect(scopes.weakCount).toBeGreaterThanOrEqual(1);
  });

  it('applies a reschedule once even when retried, and shows it in the history (P3-4)', async () => {
    const learner = await createLearner();
    const { conceptId } = await practice(learner, 'streams', FIXTURE_ANSWERS.streams?.pass ?? '');
    const dueOn = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const body = {
      conceptId,
      dueOn,
      reason: 'Exam prep order',
      clientKey: crypto.randomUUID(),
    };

    const first = OverrideResponseSchema.parse(
      await invoke(learner.client, 'override-schedule', body),
    );
    const retry = OverrideResponseSchema.parse(
      await invoke(learner.client, 'override-schedule', body),
    );

    expect(first.replayed).toBe(false);
    expect(first.reviewState).toMatchObject({ manualDueOverride: true, intervalDays: 3 });
    // The learner's timezone is UTC, so the review is due at midnight UTC on that date.
    expect(new Date(first.reviewState.dueAt ?? '').toISOString()).toBe(`${dueOn}T00:00:00.000Z`);
    expect(retry).toMatchObject({ replayed: true, event: { id: first.event.id } });
    const history = await rpc<{ events: { eventType: string; reason: string | null }[] }>(
      learner.client,
      'concept_history',
      {
        concept_id: conceptId,
      },
    );
    expect(history.events.filter((e) => e.eventType === 'manual_override')).toEqual([
      expect.objectContaining({ reason: 'Exam prep order' }),
    ]);

    const past = await learner.client.functions.invoke('override-schedule', {
      body: { ...body, dueOn: '2020-01-01', clientKey: crypto.randomUUID() },
    });
    expect(past.error).not.toBeNull();
  });

  it('keeps learners apart', async () => {
    const [a, b] = await Promise.all([createLearner(), createLearner()]);
    await practice(a, 'queues', FIXTURE_ANSWERS.queues?.partial ?? '');
    const seen = await rpc<Due>(b.client, 'due_reviews', { due_window: 'upcoming' });
    expect(seen.items).toHaveLength(0);
    expect((await b.client.from('misconceptions').select('id')).data).toEqual([]);
  });
});
