# Phase 0 — Engineering Foundation

**Starts only after:** "Architecture approved. Begin Phase 0."

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
