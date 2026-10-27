# Testing

**Status:** Implemented in Phase 0. Commands below are real.

## Layers
| Layer | Tool | Location | Command | Needs local Supabase |
|---|---|---|---|---|
| Unit (core) | Vitest | `supabase/functions/_shared/**/*.test.ts` | `npm run test:unit` | No |
| Unit (scripts) | Vitest | `scripts/**/*.test.ts` | `npm run test:unit` | No |
| Component | Vitest + RTL + jsdom | `src/**/*.test.tsx` | `npm run test:unit` | No |
| Database | pgTAP | `supabase/tests/*.test.sql` | `npm run test:db` | Yes |
| Integration | Vitest (node) | `tests/integration/` | `npm run test:int` | Yes |
| E2E | Playwright (Chromium) + axe | `tests/e2e/` | `npm run test:e2e` | Smoke: no. Auth flows: yes, plus `OWNER_EMAIL`/`OWNER_PASSWORD` |
| Edge type-check | Deno | `supabase/functions/` | `npm run check:deno` | No |
| Calibration | Script | `scripts/calibrate.ts` | Phase 2 | — |

`npm run check` = lint + format check + typecheck + unit/component tests. Run it before every push.

## Principles
- The core is tested with an injected clock and timezone. No `Date.now()` in the core.
- The AI is always mocked in CI (from Phase 2).
- Database tests use two users to prove isolation. Every PR that adds a table adds RLS tests.
  The baseline test `000_baseline_privileges.test.sql` fails if any `public` table lacks RLS, or if new objects receive implicit grants.
- E2E tests that need a session skip themselves when owner credentials are not set, so `npm run test:e2e` works without Docker.
- Accessibility: `@axe-core/playwright`, with zero serious or critical violations allowed.

## CI jobs (`.github/workflows/ci.yml`)
| Job | Contents |
|---|---|
| `quality` | lint, format, typecheck, unit tests with coverage, build, bundle secret scan |
| `deno` | `deno check` of all Edge Functions and the shared core |
| `supabase` | local stack, pgTAP, types drift check, owner creation, integration, Playwright |
| `secrets` | gitleaks over full git history (`.gitleaks.toml` allowlists intentional test fixtures) |
