# ADR-0002: Pure TypeScript domain core shared by SPA and Edge Functions

**Status:** Accepted (2026-10-27). Phase 0 spike passed (see Results).

**Context.** Scheduling, grading normalization, selection ranking, and analytics formulas must be testable without the UI (brief §7) and must not be duplicated (brief §16).
Edge Functions run on Deno and bundle from `supabase/functions/`. The SPA is built by Vite and tested by Vitest on Node.

**Decision.** Place the core at `supabase/functions/_shared/core/` as dependency-light, side-effect-free TypeScript:
- Only relative imports with explicit `.ts` extensions inside the core.
- One allowed runtime dependency, Zod, imported through a single re-export module (`core/deps.ts`) as the bare specifier `zod`. Node/Vite resolve it from `node_modules`; Deno resolves it through the `imports` map in `supabase/functions/deno.json` and each function's own `deno.json` (`npm:zod@^4.6.7`). Keep these versions in step with `package.json`.
- The SPA imports it via the `@core/*` path alias. Vitest runs core tests on Node. A CI job also type-checks the core with `deno check`.

**Phase 0 spike exit criteria.** One core function and its Zod schema are (1) imported by the SPA and built by Vite, (2) imported by a deployed-locally Edge Function, (3) tested by Vitest, and (4) checked by `deno check`.
If the spike fails, the fallback is a `packages/core` workspace package bundled into functions with a pre-deploy copy step (documented in a superseding ADR).

**Results (Phase 0).** Spike module: `core/contracts/health.ts`, a Zod schema plus a pure builder.
1. SPA + Vite build: the Settings page imports `CORE_VERSION` via `@core/*`, and the production build contains it. ✅
2. Edge Function: `supabase/functions/health` imports the core. It was served under Deno 2.9 locally (GET 200 with a schema-valid body, POST 405). In CI it is served by the Supabase edge runtime, and the integration test validates the response against the same schema. ✅ (locally) / CI
3. Vitest: `health.test.ts` passes. ✅
4. `deno check .` in `supabase/functions` passes with no `node_modules` present. ✅

The fallback (`packages/core` with a copy step) is not needed.

**Consequences.** + A single source of truth. − Constraints on core imports (no Node or Deno globals), enforced by an ESLint `no-restricted-imports` rule.
