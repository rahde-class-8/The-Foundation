# Phase 0 — Engineering Foundation

**Authorized:** 2026-10-27 ("Architecture approved. Begin Phase 0.")  
**Status:** Complete. All acceptance criteria are verified (CI run [40479561117](https://github.com/rahde-class-8/The-Foundation/actions/runs/40479561117)). Awaiting owner sign-off.

## Goals
A reproducible, CI-verified skeleton where every later phase can add a vertical slice without touching tooling.

## Deliverables
1. Git repository with `.gitignore`, `.editorconfig`, `.nvmrc` (current Node LTS), and `README.md`.
2. Vite + React + TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind, shadcn/ui initialized, React Router, TanStack Query.
3. ESLint (typescript-eslint, react-hooks, jsx-a11y, import boundaries including the core import restriction) and Prettier.
4. Vitest + RTL configured. Playwright configured with one smoke test.
5. Supabase CLI (pinned) with `supabase/config.toml`: signups disabled, local Studio, the `sources` bucket defined.
6. Environment management: `.env.example`; Zod-validated env in the SPA and functions; separate local/staging/prod configs.
7. App shell: layout, nav to the 7 routes (placeholders), `/login`, auth guard, `<QueryBoundary>` pattern.
8. **ADR-0002 spike:** a shared `core/ping.ts` used by the SPA, an Edge Function, Vitest, and `deno check`.
9. CI (GitHub Actions): install → lint → typecheck → unit → `supabase start` → `db reset` → pgTAP → Playwright smoke → build → bundle secret scan → gitleaks.
10. `operations/LOCAL_SETUP.md` updated to the real, verified steps.

## Acceptance criteria
| ID | Criterion |
|---|---|
| P0-1 | A fresh clone and the documented steps run the app locally, verified on a clean machine or container |
| P0-2 | `npm run check` (lint + typecheck + unit) passes; CI passes on the main branch |
| P0-3 | An unauthenticated visit to `/dashboard` redirects to `/login`. The seeded local owner can sign in and out. |
| P0-4 | Sign-up is rejected by local Supabase (AUTH-2a) |
| P0-5 | The ADR-0002 spike passes all four checks, or a superseding ADR is accepted |
| P0-6 | The bundle secret scan fails the build when a fake key is injected (negative test) |

## Risks
Shared-code spike failure (R4) → the fallback is documented in ADR-0002.

## Implementation results

| ID | Result | Evidence |
|---|---|---|
| P0-1 | ✅ | CI job `supabase` on a clean Ubuntu runner: `npm ci` → `supabase start` → migrations → owner → integration → E2E |
| P0-2 | ✅ | `npm run check` locally. CI jobs `quality`, `deno`, `supabase`, `secrets` all green. |
| P0-3 | ✅ | `routes.test.tsx` (component), `smoke.spec.ts` (redirect), `auth.spec.ts` (owner signs in, visits sections, survives reload, signs out). 3/3 Playwright tests passed in CI. |
| P0-4 | ✅ | `foundation.test.ts › rejects self-registration` passes with the email provider enabled |
| P0-5 | ✅ | ADR-0002 Results. The Edge Function, served by the Supabase edge runtime in CI, returns a schema-valid response. |
| P0-6 | ✅ | `secret-scan.test.ts`, plus a manual injection of a fake service-role JWT into `dist/` (exit 1) |

Database guard: `000_baseline_privileges.test.sql` 5/5 in CI. Generated types match the schema (drift check green).

### Lessons recorded during CI bring-up
- In the Supabase CLI, `[auth.email] enable_signup` toggles the **email provider itself**. Registration is blocked by `[auth] enable_signup = false` alone.
- `ALTER DEFAULT PRIVILEGES … IN SCHEMA` cannot remove the global `PUBLIC` EXECUTE default on functions. A global revoke for the migration role is required.
- `vite preview` must bind `127.0.0.1` explicitly for Playwright on CI runners (`localhost` → `::1`).
- Failed CI steps publish their output tail as annotations (`.github/scripts/run-annotated.sh`), so failures can be read through the Checks API.

### Notable decisions
- Toolchain versions: ADR-0010 (TypeScript 6.0, ESLint 9).
- Baseline migration revokes Supabase's default grants to `anon`/`authenticated` on new public tables, sequences, and functions. Every object must be granted explicitly (pgTAP guard `000_baseline_privileges.test.sql`).
- The service-role key is used only by local developer scripts (`db:create-owner`), which refuse non-local URLs.
- Feature routes are lazy-loaded. The entry chunk is ~200 kB gzipped (required libraries). Budget set in `vite.config.ts`.
