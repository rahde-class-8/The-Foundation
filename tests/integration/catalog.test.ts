import { createClient } from '@supabase/supabase-js';
import { readLocalSupabase } from '../../scripts/lib/local-supabase.ts';

// Runs after `npm run catalog:import` in CI.
const local = readLocalSupabase();
const client = () => createClient(local.apiUrl, local.anonKey, { auth: { persistSession: false } });
const ownerEmail = process.env.OWNER_EMAIL;
const ownerPassword = process.env.OWNER_PASSWORD;

describe('catalog over the API', () => {
  it('denies anonymous access to catalog tables and functions (X-2)', async () => {
    const anon = client();

    const table = await anon.from('services').select('id');
    const rpc = await anon.rpc('search_catalog', {});

    expect(table.error?.code).toBe('42501');
    expect(rpc.error?.code).toBe('42501');
  });

  it.runIf(ownerEmail && ownerPassword)(
    'serves the imported seed catalog to the owner',
    async () => {
      const owner = client();
      const { error: signInError } = await owner.auth.signInWithPassword({
        email: ownerEmail ?? '',
        password: ownerPassword ?? '',
      });
      expect(signInError).toBeNull();

      const { data, error } = await owner.rpc('search_catalog', { q: 'elb' });
      expect(error).toBeNull();
      expect((data as { items: { slug: string }[] }).items.map((item) => item.slug)).toEqual([
        'elastic-load-balancing',
      ]);

      const answers = await owner.from('question_versions').select('reference_answer_md');
      expect(answers.error?.code).toBe('42501');
    },
  );
});
