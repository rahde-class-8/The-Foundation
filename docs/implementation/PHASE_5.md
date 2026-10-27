# Phase 5 — MVP Release

## Goals
Verify the Definition of Done (brief §14), harden, and document operations.

## Deliverables
1. Golden-path E2E (DoD 1–10) and failure-path E2E suites on Chromium desktop and a WebKit mobile viewport.
2. Security validation per SECURITY §10, including the Supabase security advisor and the MFA decision.
3. Accessibility audit: axe on every route (0 serious or critical), keyboard-only walkthrough, screen-reader spot check of the practice loop.
4. Responsive check at 360, 768, and 1280 px.
5. Backup and recovery: documented Supabase backup posture, a scripted logical export (`pg_dump` of app schemas + Storage object list), and a **restore drill** into a fresh local project.
6. Deployment instructions (DEPLOYMENT.md) for the chosen hosting (Q4), including secrets, migrations, catalog import, function deploy, and CSP headers.
7. JSON export of learning history (SET-4).
8. Release checklist completed, and documentation reconciled with the implemented system.

## Acceptance criteria (= Definition of Done)
| ID | Criterion |
|---|---|
| P5-1 | DoD steps 1–10 pass E2E |
| P5-2 | Critical test suites green in CI |
| P5-3 | `supabase db reset` + catalog import reproduces a working environment |
| P5-4 | RLS isolation suite green; anon has zero access |
| P5-5 | AI failure recovery E2E green |
| P5-6 | Docs match the implementation (owner review) |
| P5-7 | 0 open critical security defects; 0 open major data-integrity defects |
| P5-8 | Restore drill succeeds and the restored app shows identical dashboard figures |
