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

# 4. Write .env.local with the public local URL and anon key.
npm run env:local

# 5. Run the app.
npm run dev            # http://localhost:5173
```

Edge Functions are served automatically by `supabase start` at `http://127.0.0.1:54321/functions/v1/<name>`.
Liveness check: `curl http://127.0.0.1:54321/functions/v1/health`.

## Environment variables
| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env.local` (written by `npm run env:local`) | Public client config, validated at startup by `src/lib/env.ts` |
| `AI_*` | `supabase/functions/.env` (local) or `supabase secrets set` (remote) | Introduced in Phase 2 |

Never put the service-role key or AI keys in any `VITE_*` variable. CI fails the build if one appears in `dist/`.

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
| `supabase start`, `db reset`, pgTAP, owner creation, integration tests, authenticated E2E, type generation | CI only. The development container's network policy blocks container-registry downloads. |
