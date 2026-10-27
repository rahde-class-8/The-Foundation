# Local Setup

**Status:** Implemented in Phase 0. The steps below are exercised end to end by CI (`.github/workflows/ci.yml`, job `supabase`) on a clean
Ubuntu runner. See "Verification notes" for what was verified where.

## Prerequisites
| Tool | Version | Notes |
|---|---|---|
| Node.js | 22 LTS (`.nvmrc`; `engines` requires ≥ 22.12) | Scripts in `scripts/` run TypeScript directly via Node's type stripping |
| Docker | Engine or Desktop, running | Required by the local Supabase stack |
| Supabase CLI | Pinned in `devDependencies` (`npx supabase …`) | No global install needed |
| Deno | 2.x, optional | Only for `npm run check:deno`; CI always runs it |

## First-time setup
```bash
git clone https://github.com/rahde-class-8/The-Foundation.git && cd The-Foundation
nvm use
npm ci

# 1. Start the local stack (Postgres, Auth, Storage, Edge Functions, API gateway).
#    Excluding unused services keeps it light.
npx supabase start -x studio,imgproxy,vector,logflare,supavisor,realtime

# 2. Apply migrations + seed from scratch (also run this after pulling new migrations).
npm run db:reset

# 3. Create the single owner account (signups are disabled by design).
OWNER_EMAIL=you@example.com OWNER_PASSWORD='at-least-12-chars-Aa1' npm run db:create-owner

# 4. Load the curated catalog (re-run after editing content/catalog; it is idempotent).
npm run catalog:import

# 5. Write .env.local with the public local URL and anon key.
npm run env:local

# 6. Run the app.
npm run dev            # http://localhost:5173
```

Edge Functions are served automatically by `supabase start` at `http://127.0.0.1:54321/functions/v1/<name>`.
Liveness check: `curl http://127.0.0.1:54321/functions/v1/health`.

## Environment variables
| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env.local` (written by `npm run env:local`) | Public client config, validated at startup by `src/lib/env.ts` |
| `AI_*`, `ANTHROPIC_API_KEY` | `supabase/functions/.env` (local) or `supabase secrets set` (remote) | AI grading; see below |

Never put the service-role key or AI keys in any `VITE_*` variable. CI fails the build if one appears in `dist/`.

## AI grading
By default the local stack grades with a deterministic **mock** grader, so no key is needed. To grade with Claude:

1. `cp supabase/functions/.env.example supabase/functions/.env` and set `ANTHROPIC_API_KEY`.
2. Serve the functions with that file: `npx supabase functions serve --env-file supabase/functions/.env`.
3. Optionally check grading quality first: `ANTHROPIC_API_KEY=… npm run ai:calibrate` (30 calls; costs a little).

`AI_MONTHLY_BUDGET_USD` and `AI_RATE_LIMIT_PER_HOUR` cap spending. When grading fails or is off, you grade yourself.
`supabase/functions/.env` is git-ignored; never commit it.

## Content import (Phase 4)
`/content` uploads PDFs to the local Storage bucket `sources` and turns them into passages with the `ingest-source`
function. AI drafts use the same provider settings as grading: the mock drafter by default, Claude when
`supabase/functions/.env` sets `AI_PROVIDER=anthropic` and a key. Generating, reviewing, and publishing drafts needs the
owner account. If an upload stops (for example, you close the tab), open `/content` and press **Resume**.

To regenerate the PDF test fixtures: `pip install reportlab pypdf && python3 scripts/fixtures/make_pdfs.py`.

## Test clock (Phase 3)
Integration and E2E tests move a throwaway learner's clock forward to check spaced repetition (ADR-0012). This needs
the `test_clock` flag that `supabase/seed.sql` inserts. Databases created before Phase 3 do not have it: run
`npx supabase db reset` once (this also deletes your local study data and accounts; re-run `db:create-owner` and
`catalog:import` afterwards). Test learners use `@example.test` addresses and never see your data.

## Everyday commands
See the table in the root `README.md`.

## Troubleshooting
- **`supabase start` cannot pull images:** the stack pulls container images from public registries (ghcr.io, public.ecr.aws, Docker Hub). Restricted networks must allow them.
- **Sign-in fails with "Invalid login credentials":** re-run `npm run db:create-owner`. It is idempotent and resets the password.
- **Type errors after a migration:** run `npm run db:types`. CI checks that the committed types match the schema.

## Verification notes (Phase 0)
| Step | Verified in |
|---|---|
| `npm ci`, `npm run check`, `npm run build`, secret scan, Playwright smoke, `deno check` | Development container and CI |
| `supabase start`, pgTAP, owner creation, integration tests, authenticated E2E, type generation | CI (green). The cloud development container's network policy blocks container-registry downloads, so these do not run there. |
