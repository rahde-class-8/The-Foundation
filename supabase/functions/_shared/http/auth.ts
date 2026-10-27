import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './errors.ts';

export type ServerEnv = { url: string; anonKey: string; serviceRoleKey: string };

export function readServerEnv(env: (name: string) => string | undefined): ServerEnv {
  const url = env('SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey)
    throw new Error('Supabase environment is not configured.');
  return { url, anonKey, serviceRoleKey };
}

/** Verifies the caller's JWT with Supabase Auth and returns the user id. */
export async function authenticate(request: Request, env: ServerEnv): Promise<string> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) throw new ApiError('unauthorized', 'Sign in to continue.');
  const client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user)
    throw new ApiError('unauthorized', 'Your session has expired. Sign in again.');
  return data.user.id;
}

/**
 * Service-role client for the two server-only writes (AI evaluations, review transitions; ADR-0011).
 * Callers must have authenticated the user and must scope every query to that user.
 */
export function serviceClient(env: ServerEnv): SupabaseClient {
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
