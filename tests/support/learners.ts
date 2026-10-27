import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readLocalSupabase, type LocalSupabase } from '../../scripts/lib/local-supabase.ts';

// Throwaway learners for clock-dependent tests: each gets its own account and test clock, so tests
// stay isolated from the owner account and from each other. Local stacks only.

export type Learner = { id: string; email: string; password: string; client: SupabaseClient };

const DAY = 86_400;

let cached: LocalSupabase | undefined;
/** `supabase status` is slow, so the connection details are read once per test process. */
function localDefault(): LocalSupabase {
  cached ??= readLocalSupabase();
  return cached;
}

export function adminClient(local: LocalSupabase = localDefault()) {
  return createClient(local.apiUrl, local.serviceRoleKey, { auth: { persistSession: false } });
}

export async function createLearner(local: LocalSupabase = localDefault()): Promise<Learner> {
  const email = `learner-${crypto.randomUUID()}@example.test`;
  const password = `Pw-${crypto.randomUUID()}`;
  const created = await adminClient(local).auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) throw created.error ?? new Error('createUser failed');
  const client = createClient(local.apiUrl, local.anonKey, { auth: { persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { id: created.data.user.id, email, password, client };
}

/** Moves one learner's database clock (private.now_for). Needs the 'test_clock' flag from supabase/seed.sql. */
export async function setClock(
  userId: string,
  offsetSeconds: number,
  local: LocalSupabase = localDefault(),
) {
  const { error } = await adminClient(local).rpc('set_test_clock', {
    p_user_id: userId,
    p_offset_seconds: Math.round(offsetSeconds),
  });
  if (error)
    throw new Error(
      `set_test_clock: ${error.message} (run "npx supabase db reset" to load supabase/seed.sql)`,
    );
}

export const days = (n: number) => n * DAY;

export async function rpc<T>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T;
}

export async function invoke<T>(client: SupabaseClient, name: string, body: unknown): Promise<T> {
  const { data, error } = await client.functions.invoke(name, {
    body: body as Record<string, unknown>,
  });
  if (error) {
    const detail =
      'context' in error ? await (error.context as Response).text().catch(() => '') : '';
    throw new Error(`${name}: ${error.message} ${detail}`);
  }
  return data as T;
}

/** Answers that the mock grader scores as each grade for the practice fixture's questions. */
export const FIXTURE_ANSWERS: Record<string, Record<'pass' | 'partial' | 'miss', string>> = {
  queues: {
    pass: 'Queues decouple producers from consumers, and buffering absorbs traffic spikes.',
    partial: 'Queues decouple producers from consumers.',
    miss: 'I am not sure.',
  },
  topics: {
    pass: 'Topics push every message to subscribers; subscribers never poll topics.',
    partial: 'Topics push every message to subscribers.',
    miss: 'I am not sure.',
  },
  streams: {
    pass: 'Streams keep records ordered for replay, and many consumers read the same records.',
    partial: 'Streams keep records ordered for replay.',
    miss: 'I am not sure.',
  },
};

export async function fixtureConcepts(client: SupabaseClient): Promise<Record<string, string>> {
  const { data, error } = await client
    .from('service_concepts')
    .select('id, slug, services!inner(slug)')
    .eq('services.slug', 'practice-fixture');
  if (error) throw error;
  const map = Object.fromEntries((data ?? []).map((row) => [row.slug as string, row.id as string]));
  if (!map.queues || !map.streams)
    throw new Error('practice fixture not imported (npm run catalog:import -- --fixture practice)');
  return map;
}
