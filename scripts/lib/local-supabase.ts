import { execFileSync } from 'node:child_process';

export type LocalSupabase = { apiUrl: string; anonKey: string; serviceRoleKey: string };

/** Reads connection details from the running local stack (`supabase status`). Local use only. */
export function readLocalSupabase(): LocalSupabase {
  const raw = execFileSync('npx', ['supabase', 'status', '--output', 'json'], { encoding: 'utf8' });
  const status = JSON.parse(raw.slice(raw.indexOf('{'))) as Record<string, string | undefined>;
  const apiUrl = status.API_URL;
  const anonKey = status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY;
  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Local Supabase is not running or returned unexpected status. Run "npx supabase start".',
    );
  }
  const host = new URL(apiUrl).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Refusing to use non-local Supabase at ${apiUrl}.`);
  }
  return { apiUrl, anonKey, serviceRoleKey };
}
