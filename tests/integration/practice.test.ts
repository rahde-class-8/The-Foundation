import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { EvaluateResponseSchema, FinalizeResponseSchema } from '@core/contracts/practice.ts';
import { readLocalSupabase } from '../../scripts/lib/local-supabase.ts';

// Requires `npm run catalog:import -- --fixture practice` (CI) and the owner account.
const local = readLocalSupabase();
const ownerEmail = process.env.OWNER_EMAIL;
const ownerPassword = process.env.OWNER_PASSWORD;

async function signedIn(): Promise<SupabaseClient> {
  const client = createClient(local.apiUrl, local.anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: ownerEmail ?? '',
    password: ownerPassword ?? '',
  });
  if (error) throw error;
  return client;
}

async function rpc<T>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T;
}

async function newAttempt(client: SupabaseClient, answer: string) {
  const services = await rpc<{ items: { id: string; slug: string }[] }>(client, 'search_catalog', {
    q: 'practice fixture',
  });
  const service = services.items.find((s) => s.slug === 'practice-fixture');
  if (!service) throw new Error('practice fixture not imported');
  const session = await rpc<{ id: string }>(client, 'start_session', {
    scope_type: 'service',
    scope_id: service.id,
  });
  const next = await rpc<{ candidates: { questionVersionId: string }[] }>(
    client,
    'next_questions',
    { session_id: session.id },
  );
  const questionVersionId = next.candidates[0]?.questionVersionId;
  const attempt = await rpc<{ id: string; isCold: boolean }>(client, 'submit_attempt', {
    session_id: session.id,
    question_version_id: questionVersionId,
    answer_md: answer,
    client_key: crypto.randomUUID(),
  });
  return { session, attempt };
}

describe.runIf(ownerEmail && ownerPassword)('practice over the API', () => {
  it('grades with the mock AI, finalizes once, and schedules the review (DoD 4–8, REC-8a)', async () => {
    const client = await signedIn();
    const { attempt } = await newAttempt(
      client,
      'Queues decouple producers from consumers, and buffering absorbs traffic spikes.',
    );

    const evaluated = await client.functions.invoke('evaluate-attempt', {
      body: { attemptId: attempt.id },
    });
    expect(evaluated.error).toBeNull();
    const evaluation = EvaluateResponseSchema.parse(evaluated.data).evaluation;
    expect(evaluation).toMatchObject({
      source: 'ai',
      status: 'completed',
      provider: 'mock',
      grade: 'pass',
    });

    const body = { attemptId: attempt.id, finalEvaluationId: evaluation.id };
    const first = FinalizeResponseSchema.parse(
      (await client.functions.invoke('finalize-attempt', { body })).data,
    );
    const again = FinalizeResponseSchema.parse(
      (await client.functions.invoke('finalize-attempt', { body })).data,
    );

    expect(first.replayed).toBe(false);
    expect(first.reviewState?.intervalDays).toBe(3);
    expect(again.replayed).toBe(true);
    const events = await client.from('review_events').select('id').eq('attempt_id', attempt.id);
    expect(events.data).toHaveLength(1);
  });

  it('keeps the answer and falls back to self-assessment when grading fails (REC-3a, REC-5a, P2-1)', async () => {
    const client = await signedIn();
    const { attempt } = await newAttempt(client, 'Something vague [[mock:timeout]]');

    const evaluated = EvaluateResponseSchema.parse(
      (await client.functions.invoke('evaluate-attempt', { body: { attemptId: attempt.id } })).data,
    );

    expect(evaluated.fallback).toBe('self_assessment');
    expect(evaluated.evaluation).toMatchObject({
      status: 'failed',
      errorCode: 'timeout',
      grade: null,
    });
    const stored = await client
      .from('attempts')
      .select('answer_md, status')
      .eq('id', attempt.id)
      .single();
    expect(stored.data).toEqual({
      answer_md: 'Something vague [[mock:timeout]]',
      status: 'submitted',
    });

    const reference = await rpc<{ referenceAnswerMd: string }>(client, 'reveal_reference', {
      attempt_id: attempt.id,
    });
    expect(reference.referenceAnswerMd).toContain('Queues decouple producers from consumers');
    const self = await rpc<{ id: string; source: string }>(client, 'submit_self_evaluation', {
      attempt_id: attempt.id,
      grade: 'miss',
    });
    expect(self.source).toBe('self');
    const finalized = FinalizeResponseSchema.parse(
      (
        await client.functions.invoke('finalize-attempt', {
          body: { attemptId: attempt.id, finalEvaluationId: self.id },
        })
      ).data,
    );
    expect(finalized.reviewState?.intervalDays).toBe(1);
  });

  it('records an invalid AI response without losing the attempt (REC-4a)', async () => {
    const client = await signedIn();
    const { attempt } = await newAttempt(client, 'Answer [[mock:invalid]]');

    const evaluated = EvaluateResponseSchema.parse(
      (await client.functions.invoke('evaluate-attempt', { body: { attemptId: attempt.id } })).data,
    );

    expect(evaluated.evaluation.status).toBe('invalid_response');
    expect(evaluated.fallback).toBe('self_assessment');
  });

  it('rejects unauthenticated function calls', async () => {
    const anon = createClient(local.apiUrl, local.anonKey, { auth: { persistSession: false } });
    const response = await fetch(`${local.apiUrl}/functions/v1/evaluate-attempt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: local.anonKey,
        Authorization: `Bearer ${local.anonKey}`,
      },
      body: JSON.stringify({ attemptId: crypto.randomUUID() }),
    });
    expect(response.status).toBe(401);
    expect((await anon.rpc('start_session', { scope_type: 'mixed' })).error?.code).toBe('42501');
  });
});
