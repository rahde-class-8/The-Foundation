# Local Setup (intended)

> **Not yet implemented.** This describes the *planned* setup. It will be replaced with verified steps at the end of Phase 0 (P0-1).
> None of the commands below work yet.

## Prerequisites (planned)
- Node.js, current LTS (pinned in `.nvmrc`)
- Docker (Desktop or Engine), required by the Supabase local stack
- Supabase CLI (version pinned in `package.json` devDependencies)
- Optional: Deno, for `deno check` of Edge Functions (CI runs it regardless)

## Planned steps
```bash
git clone <repo> && cd aws-architecture-muscle-memory
nvm use && npm ci
cp .env.example .env.local          # fill in local values printed by `supabase start`
npx supabase start                  # Postgres, Auth, Storage, Studio, Edge runtime
npx supabase db reset               # apply migrations + seed
npm run catalog:import              # load curated catalog YAML
npx supabase functions serve        # Edge Functions (AI_PROVIDER=mock by default)
npm run dev                         # SPA at http://localhost:5173
```

## Planned environment variables
| Variable | Scope | Local default |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | SPA | from `supabase start` |
| `AI_PROVIDER` | Functions | `mock` |
| `AI_MODEL_GRADING`, `AI_MODEL_GENERATION` | Functions | unset with mock |
| `AI_API_KEY_<PROVIDER>` | Functions (secret) | unset |
| `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MONTHLY_BUDGET_USD` | Functions | `20000`, `2`, `5` |
