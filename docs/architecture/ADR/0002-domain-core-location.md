# ADR-0002: Pure TypeScript domain core shared by SPA and Edge Functions

**Status:** Proposed. **Requires a Phase 0 spike.**

**Context.** Scheduling, grading normalization, selection ranking, and analytics formulas must be testable without the UI (brief §7) and must not be duplicated (brief §16).
Edge Functions run on Deno and bundle from `supabase/functions/`. The SPA is built by Vite and tested by Vitest on Node.

**Decision.** Place the core at `supabase/functions/_shared/core/` as dependency-light, side-effect-free TypeScript:
- Only relative imports with explicit `.ts` extensions inside the core.
- One allowed runtime dependency, Zod, imported through a single re-export module (`core/deps.ts`), which maps to `npm:zod@<pinned>` in Deno and to `zod` in Node via the Vite/Vitest alias.
- The SPA imports it via the `@core/*` path alias. Vitest runs core tests on Node. A CI job also type-checks the core with `deno check`.

**Phase 0 spike exit criteria.** One core function and its Zod schema are (1) imported by the SPA and built by Vite, (2) imported by a deployed-locally Edge Function, (3) tested by Vitest, and (4) checked by `deno check`.
If the spike fails, the fallback is a `packages/core` workspace package bundled into functions with a pre-deploy copy step (documented in a superseding ADR).

**Consequences.** + A single source of truth. − Constraints on core imports (no Node or Deno globals), enforced by an ESLint `no-restricted-imports` rule.
