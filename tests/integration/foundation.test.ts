import { createClient } from '@supabase/supabase-js';
import { HealthResponseSchema } from '@core/contracts/health.ts';
import { readLocalSupabase } from '../../scripts/lib/local-supabase.ts';

const local = readLocalSupabase();
const anon = () => createClient(local.apiUrl, local.anonKey, { auth: { persistSession: false } });

describe('local Supabase foundation', () => {
  it('rejects self-registration (AUTH-2a / P0-4)', async () => {
    const { data, error } = await anon().auth.signUp({
      email: `intruder-${Date.now()}@example.com`,
      password: 'Sufficiently-long-1',
    });

    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it('serves an Edge Function that returns the shared core contract (ADR-0002)', async () => {
    const response = await fetch(`${local.apiUrl}/functions/v1/health`);

    expect(response.status).toBe(200);
    const parsed = HealthResponseSchema.safeParse(await response.json());
    expect(parsed.success).toBe(true);
  });

  const ownerEmail = process.env.OWNER_EMAIL;
  const ownerPassword = process.env.OWNER_PASSWORD;

  it.runIf(ownerEmail && ownerPassword)(
    'lets the owner sign in with the owner role claim',
    async () => {
      const { data, error } = await anon().auth.signInWithPassword({
        email: ownerEmail ?? '',
        password: ownerPassword ?? '',
      });

      expect(error).toBeNull();
      expect(data.user?.app_metadata.role).toBe('owner');
    },
  );
});
