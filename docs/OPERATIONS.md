# Operations runbook

How to deploy, what happens each week, and what to do when something is off.

## First deploy checklist

1. **Supabase project** (free tier): create it, then from the repo run `supabase link` and
   `supabase db push` to apply `supabase/migrations/`. Enable the `pg_cron` and `pg_net`
   extensions (Dashboard → Database → Extensions).
2. **Auth** (Dashboard → Authentication):
   - Providers: Email on; Google on with the OAuth client id/secret from your Google Cloud project
     (authorised redirect URI there: `https://<project-ref>.supabase.co/auth/v1/callback`).
   - URL configuration: Site URL `https://10kpoolhq.com`; Redirect URLs `https://10kpoolhq.com/**` (and
     `http://localhost:3000/**` for local testing). Password-reset and confirmation links land on
     `/auth/callback`, which then sends the member to `/update-password` or the dashboard.
   - **Custom SMTP** (Settings → Auth → SMTP): the built-in sender is capped at a few emails per
     hour and is meant for testing, so password resets would silently stall on a busy Sunday.
     A free [Resend](https://resend.com) account (3,000 emails/month) or any SMTP provider works;
     paste host, port, user, password and a sender address. Then raise the rate limit under
     Auth → Rate limits.
   - Keep the default email templates, or edit the wording; the Recovery template must keep
     `{{ .ConfirmationURL }}`.
3. **Vercel project** from the GitHub repo. Environment variables: copy `.env.vercel.example` to
   `.env.vercel` (gitignored), fill it in (each line says where its value comes from), and use
   **Import .env** on the Environment Variables page. They are:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`,
   `JOB_SECRET` (`openssl rand -hex 32`), `SUPABASE_URL` (Settings → Data API → Project URL),
   `SUPABASE_SERVICE_ROLE_KEY` (Settings → API Keys → Secret key; the last
   two are read by the Python functions only). Optional: `RESEND_API_KEY` and
   `REMINDER_FROM_EMAIL` (a verified sender on your Resend account) turn on the picks-due
   reminder emails; without them that job is a no-op. Production tracks `main`; `dev` deploys previews.
4. **Schedule the jobs**: open `supabase/cron/schedule.sql`, replace the job secret (and the app
   URL if `10kpoolhq.com` is not live yet), and run it once in the SQL editor. Verify with
   `select * from cron.job;`.
5. **Make yourself site admin**: `update public.profiles set is_site_admin = true where id =
   '<your uid>';` in the SQL editor (the column is deliberately not editable through the app).
6. **Import the season**: `/admin` → Sync schedule (or wait for the daily job). Check the season
   table shows 18 weeks with lock times and deadlines.
7. **Protect `main`** in GitHub (require the CI checks) and enable secret scanning + push
   protection.
8. Smoke test: `curl -H "x-job-secret: $JOB_SECRET" -X POST https://10kpoolhq.com/api/jobs/health`.

## Custom domain: 10kpoolhq.com

The production address is `https://10kpoolhq.com`, with `www.10kpoolhq.com` redirecting to it.
The app reads its address from `NEXT_PUBLIC_APP_URL`, so no code changes when the domain changes.

1. **Buy and attach.** Buy `10kpoolhq.com` in Vercel (Domains → Buy) and it is wired up
   automatically. If you buy it elsewhere, add it under the project's Settings → Domains, choose
   "Redirect www to apex", and create the DNS records Vercel shows at your registrar. Vercel issues
   the HTTPS certificate once DNS resolves, usually within minutes.
2. **Vercel environment variables.** Set `NEXT_PUBLIC_APP_URL` and `APP_URL` to
   `https://10kpoolhq.com` for Production, then redeploy (variables apply to new builds only).
3. **Supabase Auth** (Authentication → URL Configuration): Site URL `https://10kpoolhq.com`;
   Redirect URLs `https://10kpoolhq.com/**`. Keep the `*.vercel.app` entries while preview
   deployments need to sign in. Password-reset and sign-up emails build their links from the Site
   URL, so they switch over immediately.
4. **Google sign-in** (Google Cloud → APIs & Services → OAuth consent screen): add
   `10kpoolhq.com` to Authorised domains, and set the app home page and privacy links to it. The
   authorised redirect URI stays the Supabase one.
5. **Scheduled jobs.** If `schedule.sql` already ran with the old address, update the Vault secret:
   `select vault.update_secret(id, 'https://10kpoolhq.com') from vault.secrets where name = 'pickem_app_url';`
6. **Email from the domain** (optional, turns on reminders): add `10kpoolhq.com` under
   resend.com → Domains and create the DNS records it lists (SPF and DKIM). Once it shows Verified,
   set `REMINDER_FROM_EMAIL=Pick-Em <no-reply@10kpoolhq.com>` and `RESEND_API_KEY` in Vercel, and
   use the same sender in Supabase's custom SMTP settings so password resets come from it too.
7. **Check.** Open `https://www.10kpoolhq.com` (should land on `https://10kpoolhq.com`), sign in
   with email and with Google, request a password reset, and run the smoke test above.

## A normal week

| When (ET)                 | What runs                       | Where to look                                      |
| ------------------------- | ------------------------------- | -------------------------------------------------- |
| Daily 05:15               | `sync_schedule`                 | `/admin` → recent jobs                             |
| Wednesday 07:00–10:00     | `lock_lines` (hourly until done)| `/admin/lines`: every game has a line; news feed shows "Lines are locked" |
| Wednesday morning         | Admin matches the NY Post       | `/admin/lines`: edit spreads; edits are audited    |
| Nightly 11:59 PM          | Game deadlines                  | Picks sheet shows "locked"                         |
| 1–3 h before the week's last deadline | `send_reminders` | Members with nothing in get one email per league    |
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
- **Someone forgot their password.** Nothing for you to do: "Forgot password?" on the sign-in
  page emails a reset link, and `/profile` lets signed-in members change it. If the email never
  arrives, check Authentication → Logs and the SMTP settings above; as a last resort Dashboard →
  Authentication → Users → "Send password recovery".
- **Re-run settlement now.** `/admin` → "Refresh scores and settle".
- **Retire a dry-run league.** `/admin/leagues` → Archive. Members stop seeing it, nothing is
  deleted, and Restore brings it back exactly as it was.

## When something is wrong

| Symptom                                       | Check                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Job shows `failed` on `/admin`                | `job_runs.detail` has the error and request id; grep Vercel function logs for that `request_id`.                  |
| Jobs never run                                | `select * from cron.job_run_details order by start_time desc limit 20;` — `call_job` needs the Vault secrets and pg_net. |
| Admin buttons say "Could not reach the job endpoint" | Locally use `vercel dev`; in production check the Python functions deployed (`/api/jobs/health`).      |
| Lines missing for some games                  | ESPN had no consensus yet; `lock_lines` retries hourly on Wednesday, or set the line by hand.                   |
| Week will not settle                          | A game is still `scheduled`/`postponed`. Wait for it or void it.                                                 |
| Member "cannot bet": deadline passed          | Deadlines are 11:59 PM site-time the night before kickoff; confirm the timezone in `/admin/settings`.            |
| Installed app shows an old offline page       | The worker updates on the next online visit; if not, bump `VERSION` in `public/sw.js` and redeploy.              |
| CI red on the release PR                      | The Database job runs pgTAP on real Supabase; run `pnpm db:test` with Docker to reproduce, or read the job log.  |

## Backups and data

- Supabase keeps daily backups on paid tiers only; the repo's `backup.yml` workflow runs a weekly
  `pg_dump` into GitHub artifacts when `BACKUPS_ENABLED=true` and `SUPABASE_DB_URL` is set.
- The ledger and audit log are append-only; a "wrong" settlement is corrected with new rows
  (`adjustment` via a future admin tool or the SQL editor), never by editing history.

## Cost

Free tiers throughout at the target size: Supabase (500 MB DB, 1 GB storage), Vercel Hobby (the
Python functions count as serverless invocations), ESPN's public API. See PLAN.md §9.
