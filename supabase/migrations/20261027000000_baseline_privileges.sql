-- Baseline privileges (SECURITY §3, DATA_MODEL §6.1).
-- Supabase grants new public objects to anon/authenticated by default. Revoke that so every
-- table and function must be granted explicitly, alongside its RLS policies.

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;
