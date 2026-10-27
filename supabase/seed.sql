-- Local development seed. Intentionally minimal: the owner account is created with
-- `npm run db:create-owner` and the curated catalog loads with `npm run catalog:import` (Phase 1).

-- Local stacks only: allow tests to move a learner's clock (private.now_for). Hosted projects never
-- run this seed, so the test clock stays disabled there.
insert into private.environment_flags (flag) values ('test_clock') on conflict do nothing;
