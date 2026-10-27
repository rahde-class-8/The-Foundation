-- Shared helpers (DATA_MODEL §1, §6.4). Kept in the `private` schema, which PostgREST does not expose.

create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Maintains updated_at on mutable tables.
create function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Rejects UPDATE/DELETE on append-only and immutable tables.
create function private.forbid_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% on %.% is not allowed: rows are immutable', tg_op, tg_table_schema, tg_table_name
    using errcode = 'P0001';
end;
$$;

-- True when the caller's JWT carries the owner role claim (ADR-0009).
create function private.is_owner() returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner', false);
$$;
grant execute on function private.is_owner() to authenticated, service_role;
