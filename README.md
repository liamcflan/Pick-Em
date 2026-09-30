# Pick-Em

NFL spread pick'em for friend groups. Everyone starts the season with a bankroll, bets against
locked weekly spreads, and whoever has the most when the playoffs start wins the league.
Multiple leagues run at once, joined by invite code.

**Status:** Phase 1 (season-ready MVP) on `dev`. Documentation lives in [docs/](docs/README.md):
[architecture](docs/ARCHITECTURE.md), [database and data model](docs/DATABASE.md),
[jobs](docs/JOBS.md), [web app](docs/WEB.md), [testing](docs/TESTING.md),
[operations](docs/OPERATIONS.md), the [official rules](docs/RULES.md), the
[plan](docs/PLAN.md) and [ADRs](docs/adr/).

## Stack

| Layer | Choice |
|---|---|
| Web app | Next.js (App Router, TypeScript, Tailwind, shadcn-style UI) on Vercel |
| Database / Auth / Storage | Supabase (Postgres with row-level security, pg_cron for scheduling) |
| Data-pull jobs | Python 3.12 functions on Vercel (`api/jobs/*.py`), shared code in `pickem/` |
| Tests | Vitest (TS units), pytest (Python), pgTAP (every RLS policy), Playwright (e2e) |

## Branching

- `dev` — the working branch. Day-to-day work is pushed here directly; Vercel deploys it as a preview.
- `main` — production. Only changes through pull requests from `dev`, and only when CI is green
  (lint, types, unit tests, pgTAP against a real Supabase, Playwright e2e). Protect `main` in GitHub
  settings: require the three CI checks and block direct pushes.
- CI runs once per change: on the release PR and on pushes to `main`. Keep the `dev` → `main` PR
  open while working and every push to `dev` is tested through it; if no PR is open, run the CI
  workflow manually from the Actions tab.

## Local development

Prerequisites: Node 22 + pnpm, Python 3.12 + [uv](https://docs.astral.sh/uv/), Docker (for the
local Supabase stack), and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
pnpm install
uv sync
cp .env.example .env.local        # then fill in values (see below)

supabase start                    # local Postgres + Auth + Storage; applies supabase/migrations
supabase status -o env            # copy API_URL and ANON_KEY into .env.local
pnpm dev                          # http://localhost:3000 (Next.js only)
vercel dev                        # Next.js + the Python job functions under /api/jobs/*
```

Useful commands:

```bash
pnpm check          # lint + format + typecheck + unit tests + python lint + pytest
pnpm db:test        # pgTAP tests via the Supabase CLI (needs Docker)
pnpm db:test:local  # pgTAP against a plain local Postgres 16 (no Docker; see scripts/db/)
pnpm db:reset       # re-apply migrations + seed (an active 2026 season with week 5 open)
pnpm db:types       # regenerate src/lib/supabase/database.types.ts
pnpm test:e2e       # Playwright against a built app (pnpm build first)
```

## Environment variables

Copy `.env.example`. The Next.js app only ever sees the `NEXT_PUBLIC_*` values and `JOB_SECRET`;
the service-role key is read by the Python jobs alone.

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_APP_URL` | The deployed URL (used for OAuth and email redirects) |
| `JOB_SECRET` | `openssl rand -hex 32`; shared by pg_cron, the admin panel and the job functions |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Jobs only. Supabase → Project Settings → API |

## First deploy checklist

1. **Supabase project** (Free plan, US East). Run `supabase link --project-ref <ref>` then
   `supabase db push` to apply migrations. In Authentication → URL Configuration set the Site URL
   to the deployed URL and add `https://<your-domain>/auth/callback` to Redirect URLs.
2. **Google sign-in.** Google Cloud Console → APIs & Services → Credentials → OAuth client
   (Web). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the
   client id/secret into Supabase → Authentication → Providers → Google.
3. **Email.** Supabase's built-in mailer is limited to a few emails per hour. For password resets
   configure custom SMTP (Resend free tier) under Authentication → SMTP Settings.
4. **Vercel project** linked to this repo. Add the environment variables above. Python functions
   under `api/` deploy automatically; verify with
   `curl -H "x-job-secret: $JOB_SECRET" https://<app>/api/jobs/health`.
5. **Scheduling.** In the Supabase SQL editor run `supabase/cron/schedule.sql` after replacing the app URL and
   `JOB_SECRET` placeholders. It stores both in Vault and schedules the Wednesday line lock and hourly
   schedule refresh with pg_cron.
6. **Backups.** Add the `SUPABASE_DB_URL` repository secret and set the `BACKUPS_ENABLED`
   repository variable to `true` to turn on the weekly `pg_dump` workflow.

## Jobs

Python functions under `api/jobs/`, called by pg_cron through `public.call_job()` (see
`supabase/cron/schedule.sql`) or by the admin panel. All are idempotent and log a `job_runs` row.

| Job                   | When                    | What                                                                      |
| --------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `sync_schedule`       | daily                   | Import / refresh the season schedule from ESPN                            |
| `lock_lines`          | Wednesday mornings      | Store the consensus spread for each game of the week (admins may edit)    |
| `sync_finals`         | hourly                  | Refresh scores for weeks in play and call `settle_week` (payouts, busts)  |
| `weekly_action_check` | hourly                  | After a week's last deadline: automatic byes and forced 1k underdog picks |
| `health`              | on demand               | Proves the runtime and job secret work                                    |

## Repository layout

```
src/app/            Next.js routes: (auth) sign-in/up/reset, (app) dashboard, auth/callback, api/revalidate
src/lib/            supabase clients, env validation, logging, auth validation
src/components/     UI primitives and auth forms
api/jobs/           Vercel Python functions (thin wrappers)
pickem/             Python shared package: HTTP adapter, logging, settings, job implementations
supabase/           config, migrations, pgTAP tests, seed
tests/e2e/          Playwright
tests/python/       pytest
scripts/db/         local Postgres test harness (no Docker)
docs/               PLAN.md and ADRs
```

## Security model in one paragraph

The full contract is in [SECURITY.md](SECURITY.md).

The app talks to Postgres as the signed-in user, so row-level security is the authorization layer,
not decoration. Table privileges are tightened per column, every policy has a pgTAP test for both
the allowed and denied case, and money-moving operations run inside Postgres functions with row
locks. Sensitive tables write before/after snapshots to an append-only `audit_log`. Both runtimes
log one JSON object per line with a shared request id.
