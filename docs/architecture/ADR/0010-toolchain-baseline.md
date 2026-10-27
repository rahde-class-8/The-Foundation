# ADR-0010: Toolchain version baseline

**Status:** Accepted (2026-10-27, Phase 0)

**Context.** At Phase 0 the latest majors were TypeScript 7, ESLint 10, Vite 8, React 19, React Router 8, Vitest 5, Tailwind 4, and Zod 4.
Some ecosystem packages had not caught up:
- `typescript-eslint` 8.x declares `typescript >=4.8.4 <6.1.0`.
- `eslint-plugin-jsx-a11y` 6.x declares `eslint ^3 … ^9`.

**Decision.**
- **TypeScript 6.0.x**, not 7, until typescript-eslint supports 7. `baseUrl` is not used (deprecated in 6). `paths` resolve relative to each tsconfig.
- **ESLint 9.x**, not 10, because accessibility linting (jsx-a11y) is a requirement (PRD §7) and is not yet compatible with 10.
- Latest majors elsewhere: Vite 8, React 19, React Router 8 (data router: `createBrowserRouter` + `RouterProvider` from `react-router/dom`), Vitest 5, Tailwind 4 (CSS-first config via `@tailwindcss/vite`), Zod 4, supabase-js 2.
- **Playwright pinned to 1.63.0**, with `playwright-core` pinned to dedupe `@axe-core/playwright`'s peer dependency.
- No `--force` or `--legacy-peer-deps`. Peer conflicts are resolved by choosing compatible versions.

**Consequences.** + A clean, honest dependency tree. − Upgrades to TypeScript 7 and ESLint 10 are pending upstream support. Revisit at each phase boundary.
