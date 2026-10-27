# The Foundation

An AWS architecture study app (single user) that builds automatic recall of AWS services and architectural decision-making,
starting with the AWS Solutions Architect Associate (SAA) exam.

> **"The foundation: every service, as muscle memory."**
> Accurate knowledge → Active recall → Targeted correction → Spaced repetition → Architectural application.

**Status:** Phase 0 (engineering foundation). Feature screens are placeholders. See the [roadmap](docs/implementation/ROADMAP.md).

## Stack

React · TypeScript · Vite · Tailwind CSS · shadcn/ui · React Router · TanStack Query ·
Supabase (Postgres + RLS, Auth, Storage, Edge Functions) · Vitest · Testing Library · Playwright · pgTAP

## Quick start

See [docs/operations/LOCAL_SETUP.md](docs/operations/LOCAL_SETUP.md). In short:

```bash
nvm use && npm ci
npm run db:start                                   # requires Docker
OWNER_EMAIL=you@example.com OWNER_PASSWORD='…' npm run db:create-owner
npm run env:local
npm run dev                                        # http://localhost:5173
```

### Creating your login account

Sign-ups are disabled by design (single-owner app), so the only account is created with:

```bash
OWNER_EMAIL=you@example.com OWNER_PASSWORD='…' npm run db:create-owner
```

**What it does**

- `OWNER_EMAIL=… OWNER_PASSWORD='…'` sets two environment variables for this one command only; they are not saved.
- `npm run db:create-owner` runs [`scripts/create-owner.ts`](scripts/create-owner.ts), which:
  1. Reads the running local Supabase's connection details (`npx supabase status`), including its admin key.
     That key stays on your machine and is never put into the app.
  2. Refuses to run unless Supabase is on `localhost` / `127.0.0.1`, so it cannot touch a hosted database.
  3. Creates the account (email pre-confirmed, `owner` role) or, if it already exists, resets its password and role.
     Re-running it is safe, and it doubles as a password reset.
  4. Prints `Created owner account …` or `Updated owner account …`.

**Using it**

- Start Supabase first (`npm run db:start`, needs Docker), otherwise it stops with "Local Supabase is not running".
- Replace both placeholders; `…` is not a password. Example:
  `OWNER_EMAIL=me@mydomain.com OWNER_PASSWORD='MyStudyPass2026' npm run db:create-owner`
- The password needs at least 12 characters, including a lowercase letter, an uppercase letter, and a digit.
  Keep the single quotes so symbols like `$` or `!` are not interpreted by the shell.
- The email does not need to be real (no email is sent locally); it is the username for the login page.
- Then run `npm run env:local` and `npm run dev`, open http://localhost:5173, and sign in.

The password ends up in your shell history. For a local study account that is usually fine; prefixing the command with a
space keeps it out of history on most bash setups.

## Common commands

| Command              | What it does                                          |
| -------------------- | ----------------------------------------------------- |
| `npm run check`      | Lint, format check, typecheck, unit + component tests |
| `npm run test:db`    | pgTAP database tests (local Supabase)                 |
| `npm run test:int`   | Integration tests against local Supabase              |
| `npm run test:e2e`   | Playwright end-to-end tests                           |
| `npm run check:deno` | Type-check Edge Functions with Deno                   |
| `npm run db:types`   | Regenerate `src/lib/database.types.ts`                |

## Documentation

Start at [docs/README.md](docs/README.md): product requirements, architecture, ADRs, learning engine, and phase plans.
