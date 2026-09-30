# Operations runbook

How to deploy, what happens each week, and what to do when something is off.

## First deploy checklist

1. **Supabase project** (free tier): create it, then from the repo run `supabase link` and
   `supabase db push` to apply `supabase/migrations/`. Enable the `pg_cron` and `pg_net`
   extensions (Dashboard → Database → Extensions).
2. **Auth**: enable Email and Google providers; add the Google OAuth client id/secret; set the site
   URL and redirect URL to `https://<app>/auth/callback`.
3. **Vercel project** from the GitHub repo. Environment variables:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`,
   `JOB_SECRET` (`openssl rand -hex 32`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the last
   two are read by the Python functions only). Production tracks `main`; `dev` deploys previews.
4. **Schedule the jobs**: open `supabase/cron/schedule.sql`, replace the app URL and job secret,
   and run it once in the SQL editor. Verify with `select * from cron.job;`.
5. **Make yourself site admin**: `update public.profiles set is_site_admin = true where id =
   '<your uid>';` in the SQL editor (the column is deliberately not editable through the app).
6. **Import the season**: `/admin` → Sync schedule (or wait for the daily job). Check the season
   table shows 18 weeks with lock times and deadlines.
7. **Protect `main`** in GitHub (require the CI checks) and enable secret scanning + push
   protection.
8. Smoke test: `curl -H "x-job-secret: $JOB_SECRET" -X POST https://<app>/api/jobs/health`.

## A normal week

| When (ET)                 | What runs                       | Where to look                                      |
| ------------------------- | ------------------------------- | -------------------------------------------------- |
| Daily 05:15               | `sync_schedule`                 | `/admin` → recent jobs                             |
| Wednesday 07:00–10:00     | `lock_lines` (hourly until done)| `/admin/lines`: every game has a line; news feed shows "Lines are locked" |
| Wednesday morning         | Admin matches the NY Post       | `/admin/lines`: edit spreads; edits are audited    |
| Nightly 11:59 PM          | Game deadlines                  | Picks sheet shows "locked"                         |
| ~5 min after the week's last deadline | `weekly_action_check` | News feed: automatic byes / forced picks           |
| Hourly at :45 during games| `sync_finals` → `settle_week`   | Picks show won/lost; leaderboard updates; "Week N is settled" once every game is final |

Everything is idempotent: pressing the admin buttons early or twice is safe.

## Common admin tasks

- **A game was postponed / cancelled.** ESPN usually moves the kickoff (the deadline follows). If
  it will not be played this week, `/admin/lines` → **Void**: every pick on it is refunded and the
  week can settle without it (RULES.md #12).
- **Wrong line published.** Edit it on `/admin/lines` before the game's deadline. Existing picks
  keep the line they were made against; the change is audited and posts `line_edited`.
- **Change the lock day/time or timezone.** `/admin/settings`. A timezone change recomputes every
  open game's deadline immediately; a lock-time change applies to weeks on the next schedule
  import.
- **Someone disputes a pick.** `/admin/audit` → filter by the pick's row id (from the picks table)
  or by the member: every insert/update/delete with before/after values and request ids.
- **Add a co-commissioner.** The league page → Members → "Make commish" (commissioners only).
- **Re-run settlement now.** `/admin` → "Refresh scores and settle".

## When something is wrong

| Symptom                                       | Check                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Job shows `failed` on `/admin`                | `job_runs.detail` has the error and request id; grep Vercel function logs for that `request_id`.                  |
| Jobs never run                                | `select * from cron.job_run_details order by start_time desc limit 20;` — `call_job` needs the Vault secrets and pg_net. |
| Admin buttons say "Could not reach the job endpoint" | Locally use `vercel dev`; in production check the Python functions deployed (`/api/jobs/health`).      |
| Lines missing for some games                  | ESPN had no consensus yet; `lock_lines` retries hourly on Wednesday, or set the line by hand.                   |
| Week will not settle                          | A game is still `scheduled`/`postponed`. Wait for it or void it.                                                 |
| Member "cannot bet": deadline passed          | Deadlines are 11:59 PM site-time the night before kickoff; confirm the timezone in `/admin/settings`.            |
| CI red on the release PR                      | The Database job runs pgTAP on real Supabase; run `pnpm db:test` with Docker to reproduce, or read the job log.  |

## Backups and data

- Supabase keeps daily backups on paid tiers only; the repo's `backup.yml` workflow runs a weekly
  `pg_dump` into GitHub artifacts when `BACKUPS_ENABLED=true` and `SUPABASE_DB_URL` is set.
- The ledger and audit log are append-only; a "wrong" settlement is corrected with new rows
  (`adjustment` via a future admin tool or the SQL editor), never by editing history.

## Cost

Free tiers throughout at the target size: Supabase (500 MB DB, 1 GB storage), Vercel Hobby (the
Python functions count as serverless invocations), ESPN's public API. See PLAN.md §9.
