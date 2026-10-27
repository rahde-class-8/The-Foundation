begin;
select plan(2);

-- P3-2: due_reviews('today') p95 < 100 ms with 2,000 concepts × 50 events each.
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'perf@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local', '{"role":"owner"}');

select public.import_catalog(jsonb_build_object(
  'categories', jsonb_build_array(jsonb_build_object('slug', 'compute', 'name', 'Compute', 'sort_order', 1)),
  'certifications', jsonb_build_array(),
  'sources', jsonb_build_array(),
  'services', jsonb_build_array(jsonb_build_object('provider', 'aws', 'slug', 'perf', 'name', 'Perf', 'aliases', jsonb_build_array(),
    'category', 'compute', 'summary_md', 'Perf.', 'status', 'published', 'origin', 'curated', 'docs_url', null,
    'related', jsonb_build_array(), 'concepts', jsonb_build_array()))
), '00000000-0000-0000-0000-0000000000a1');

insert into public.service_concepts (service_id, slug, title, status, origin, owner_id, published_at)
select (select id from public.services where slug = 'perf'), 'perf-' || n, 'Perf concept ' || n, 'published', 'curated',
       '00000000-0000-0000-0000-0000000000a1', now()
from generate_series(1, 2000) n;

-- A third due today, a third overdue, a third upcoming.
insert into public.review_state (user_id, concept_id, mastery_status, interval_days, ease, last_cold_grade,
                                 total_cold_attempts, due_at)
select '00000000-0000-0000-0000-0000000000d1', c.id,
       (array['learning', 'reviewing', 'lapsed', 'mastered'])[1 + (row_number() over () % 4)::int],
       (row_number() over () % 30)::int, 1.3 + ((row_number() over () % 17) / 10.0),
       (array['pass', 'partial', 'miss'])[1 + (row_number() over () % 3)::int], 5,
       date_trunc('day', now()) + ((row_number() over () % 3) - 1) * interval '1 day' + interval '1 hour'
from public.service_concepts c where c.slug like 'perf-%';

insert into public.review_events (user_id, concept_id, review_state_id, event_type, idempotency_key, occurred_at)
select r.user_id, r.concept_id, r.id, 'initialized', 'perf:' || r.id || ':' || n, now() - n * interval '1 day'
from public.review_state r, generate_series(1, 50) n
where r.user_id = '00000000-0000-0000-0000-0000000000d1';
analyze public.review_state;
analyze public.review_events;
analyze public.service_concepts;

create function pg_temp.p95_ms(runs int) returns numeric language plpgsql as $$
declare
  v_start timestamptz;
  v_times numeric[] := '{}';
begin
  perform public.due_reviews('today');  -- warm up
  for i in 1..runs loop
    v_start := clock_timestamp();
    perform public.due_reviews('today');
    v_times := v_times || (extract(epoch from clock_timestamp() - v_start) * 1000)::numeric;
  end loop;
  return (select percentile_disc(0.95) within group (order by t) from unnest(v_times) t);
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
select ok(jsonb_array_length(public.due_reviews('today', 500) -> 'items') > 100, 'the fixture has hundreds of reviews due today');
select ok(p95 < 100, format('due_reviews(''today'') p95 < 100 ms (P3-2): %s ms', round(p95, 1)))
from (select pg_temp.p95_ms(20) as p95) t;
reset role;

select * from finish();
rollback;
