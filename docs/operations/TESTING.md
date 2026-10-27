# Testing (intended)

> **Not yet implemented.** This is the planned test strategy. The commands become real in Phase 0.

## Layers
| Layer | Tool | Location | Command (planned) |
|---|---|---|---|
| Unit (core) | Vitest | `supabase/functions/_shared/core/**/*.test.ts` | `npm run test:unit` |
| Component | Vitest + RTL + jsdom | `src/**/*.test.tsx` | `npm run test:unit` |
| Database | pgTAP | `supabase/tests/*.sql` | `npx supabase test db` |
| Integration | Vitest against local Supabase | `tests/integration/` | `npm run test:int` |
| E2E | Playwright | `tests/e2e/` | `npm run test:e2e` |
| Calibration | Node script | `scripts/calibrate.ts` | `npm run ai:calibrate` (real provider; manual, not in CI) |

## Principles
- The core is tested with an injected clock and timezone. No `Date.now()` in the core.
- The AI is always mocked in CI. A recorded-fixture contract test per adapter checks the request shape and response parsing.
- Database tests use two users to prove isolation. Every new table PR must add RLS tests.
- E2E uses a test-only clock control to simulate next-day cold reviews.
- Accessibility: `@axe-core/playwright` on every route.
- Required failure fixtures: AI timeout / 429 / 500 / invalid JSON / injected answers; malformed PDFs; network drop after submit.
