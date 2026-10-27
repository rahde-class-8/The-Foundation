// Creates (or updates) the single owner account in the LOCAL Supabase stack (ADR-0009).
// Usage: OWNER_EMAIL=... OWNER_PASSWORD=... npm run db:create-owner
import { createClient } from '@supabase/supabase-js';
import { readLocalSupabase } from './lib/local-supabase.ts';

const email = process.env.OWNER_EMAIL;
const password = process.env.OWNER_PASSWORD;
if (!email || !password) {
  console.error('Set OWNER_EMAIL and OWNER_PASSWORD.');
  process.exit(2);
}

const { apiUrl, serviceRoleKey } = readLocalSupabase();
const admin = createClient(apiUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: list, error: listError } = await admin.auth.admin.listUsers();
if (listError) throw listError;

const existing = list.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
const attributes = { password, email_confirm: true, app_metadata: { role: 'owner' } };

const { error } = existing
  ? await admin.auth.admin.updateUserById(existing.id, attributes)
  : await admin.auth.admin.createUser({ email, ...attributes });
if (error) throw error;

console.log(`${existing ? 'Updated' : 'Created'} owner account ${email}.`);
