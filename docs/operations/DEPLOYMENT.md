# Deployment (intended)

> **Not yet implemented. No infrastructure exists.** Finalized in Phase 5 after the hosting decision (Q4).

## Planned topology
- **Supabase Cloud project** (one for staging, one for production): Postgres, Auth (signups disabled), Storage (private `sources` bucket), Edge Functions.
- **Static SPA hosting** with HTTPS, security headers, and CSP (SECURITY §8). Candidates: Netlify, Vercel, Cloudflare Pages, or S3 + CloudFront.

## Planned release procedure
1. CI green on the release commit.
2. Take a backup snapshot / logical export of production.
3. `supabase db push` (migrations), then `npm run catalog:import` against the target.
4. `supabase functions deploy` and `supabase secrets set` (AI keys and config).
5. Deploy the SPA build with environment-specific `VITE_*` values.
6. Smoke test: sign in, open the library, then one self-assessed question end to end.

## Planned backup and recovery
Supabase-managed daily backups (per plan tier), plus a scripted logical export of app schemas and Storage. Restore is drilled in Phase 5 (P5-8).
