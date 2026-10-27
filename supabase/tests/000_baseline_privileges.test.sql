begin;
select plan(5);

-- Guard for every future migration: no table in public may exist without RLS.
select is(
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity),
  0::bigint,
  'every table in public has row-level security enabled'
);

-- New objects created by the migration role (postgres) receive no implicit grants.
set local role postgres;
create table public.__privilege_probe (id int);
alter table public.__privilege_probe enable row level security;
create function public.__privilege_probe_fn() returns int language sql as 'select 1';

reset role;

select ok(not has_table_privilege('anon', 'public.__privilege_probe', 'select'), 'anon has no default table access');
select ok(not has_table_privilege('authenticated', 'public.__privilege_probe', 'select'), 'authenticated has no default table access');
select ok(not has_function_privilege('anon', 'public.__privilege_probe_fn()', 'execute'), 'anon has no default function access');
select ok(not has_function_privilege('authenticated', 'public.__privilege_probe_fn()', 'execute'), 'authenticated has no default function access');

select * from finish();
rollback;
