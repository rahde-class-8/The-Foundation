-- Baseline privileges (SECURITY §3, DATA_MODEL §6.1).
-- Supabase grants new public objects to anon/authenticated by default. Revoke that so every
-- table and function must be granted explicitly, alongside its RLS policies.

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;

-- Functions are executable by PUBLIC through a global default, which a schema-scoped rule cannot
-- remove. Revoke it globally for objects created by the migration role.
alter default privileges for role postgres revoke execute on functions from public;
