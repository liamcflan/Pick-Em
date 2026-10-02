# ADR 0001: Next.js on Vercel + Supabase, Python for data-pull jobs

Date: 2026-09-29 · Status: Accepted

## Context

Pick-Em is a friends-first NFL spread pick'em that must run for the rest of the 2026 season at
near-zero cost, support many leagues, and be credible in a portfolio. Decisions were taken with the
owner in [docs/PLAN.md](../PLAN.md) §1.

## Decision

- **Next.js (App Router, TypeScript) on Vercel Hobby** for all user-facing pages and actions.
- **Supabase** for Postgres, Auth, Storage and scheduling (pg_cron → pg_net → HTTP).
- **Python 3.12 functions on Vercel** (`api/jobs/*.py`) for the data-pull jobs: schedule import,
  weekly spread lock, score sync. Shared code lives in the root `pickem/` package because Vercel
  treats every file under `api/` as an HTTP endpoint.
- **The app talks to Postgres as the signed-in user** via `@supabase/ssr` (anon key + user JWT), so
  row-level security is the real authorization layer. The service-role key is used only by jobs.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Single $5/mo VPS with Docker | Owner wanted $0 and no ops; managed services are also what most reviewers recognise |
| Neon + Auth.js + R2 | Three vendors to wire; RLS possible but the JWT→role plumbing is ours to get wrong |
| Drizzle/Prisma as a service role | Bypasses RLS unless every request does `SET ROLE`; too easy to leak data across leagues |
| Supabase Edge Functions for jobs | Deno/TypeScript only; owner wanted Python for data work |
| Separate Python service (Render/Fly/Modal) | Extra vendor and/or cost; Vercel already runs Python for free |
| Vercel Cron | Hobby plan is once-per-day; score polling needs minutes |

## Consequences

- Two toolchains in one repo (pnpm + uv). CI runs both on every PR.
- Free-tier caveats: Supabase pauses idle projects after 7 days (off-season only); no automated
  backups, so a weekly `pg_dump` workflow ships in Phase 0.
- Everything is plain Next.js + plain Postgres, so moving to a VPS later is a config change.
