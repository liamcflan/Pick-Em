# Architecture

How the pieces fit together. For the *why* behind the big choices see [adr/](adr/); for the
product plan and phases see [PLAN.md](PLAN.md).

## The shape of the system

```
Browser ──HTTPS──▶ Vercel
                    ├─ Next.js 16 (App Router, React Server Components, Server Actions)
                    │     src/app/**        pages + server actions
                    │     src/proxy.ts      auth cookie refresh + security headers (CSP nonce)
                    │     src/lib/**        supabase clients, domain logic, validation, logging
                    │
                    └─ Python 3.12 functions   api/jobs/*.py  ──▶  pickem/ (jobs, ESPN provider)
                              ▲                       │
                              │ X-Job-Secret          │ service-role key (bypasses RLS)
                              │                       ▼
Supabase ──────────── pg_cron ┘            Postgres (RLS, functions, triggers)
   ├─ Auth (email + Google)                Storage (logos bucket)
   ├─ PostgREST (the API the app uses)     Vault (job secret + app URL for pg_cron)
   └─ pg_cron + pg_net (schedules the jobs by HTTP)
                                                        ▲
                                          ESPN scoreboard API (schedule, scores, consensus lines)
```

Three trust levels talk to the database:

| Who                      | Credential                     | Sees                                             |
| ------------------------ | ------------------------------ | ------------------------------------------------ |
| A signed-in member       | anon key + their JWT           | What RLS allows for that user                    |
| Site admin (a member)    | same                           | Extra rows/columns where policies check `is_site_admin()` |
| Python jobs              | service-role key               | Everything; only ever runs vetted functions      |

The Next.js app never holds the service-role key (an ESLint rule fails the build if `src/`
references it).

## Request paths

**Page load.** `src/proxy.ts` runs on every request: it refreshes the Supabase session cookie
(honouring "remember me"), generates a CSP nonce and attaches the security headers. Pages are React
Server Components that query PostgREST as the user and render HTML. Time-dependent reads (`Date.now()`)
live in `load…Data()` helpers outside the component so rendering stays pure.

**Mutation.** Forms post to Server Actions (`actions.ts` next to each route). Each action: gets the
user, parses input with Zod, calls a Postgres function through `supabase.rpc()` or a column-limited
`update`, maps errors to friendly text (`friendlyDbError`), then `revalidatePath()`.

**Job.** pg_cron calls `public.call_job(name, body)`, which POSTs to `https://<app>/api/jobs/<name>`
with the `x-job-secret` header from Vault. `pickem.vercel.make_handler` verifies the secret in
constant time, assigns a request id, runs the job, records a `job_runs` row and returns JSON. Site
admins can also trigger jobs from `/admin` (the server calls the same endpoint with the secret).

## Where the rules live

| Rule (docs/RULES.md)                            | Enforced in                                                |
| ----------------------------------------------- | ---------------------------------------------------------- |
| Whole-thousand wagers, budget, deadlines, byes  | `place_pick_internal` (Postgres)                           |
| Push = loss, void = refund, even money          | `settle_game` (Postgres)                                   |
| Paid at week end, weekly budget snapshot        | `week_budget_cents` / `available_cents` (Postgres)         |
| Auto bye / forced 1k on the underdog            | `weekly_action_check` (Postgres) called by the Python job  |
| Elimination at 0, last one standing, season end | `settle_week` (Postgres)                                   |
| Wednesday lines, admin edits to match the Post  | `lock_lines` job + `set_line`; lines are versioned         |
| 11:59 PM the night before, site timezone        | `games_set_deadline` trigger                               |

The UI only mirrors these rules for a good experience (disabled buttons, "picks close Saturday
11:59 PM"); it is never the last line of defence.

## Weekly loop

1. **Schedule** – `sync_schedule` (daily) upserts weeks and games from ESPN and computes each
   week's `spread_lock_at` from the settings.
2. **Lines** – `lock_lines` (Wednesday mornings) writes one consensus line per game; a site admin
   may edit any line to match the New York Post until that game's deadline.
3. **Picks** – members bet from the picks sheet until 11:59 PM the night before each game.
4. **Action check** – `weekly_action_check` (hourly) runs once the week's last deadline has
   passed: auto byes and forced picks.
5. **Results** – `sync_live` (every two minutes while games are on) and `sync_finals` (hourly
   safety net) refresh scores and call `settle_week`, which grades
   finished games immediately and settles the week when everything is final: payouts,
   eliminations, `week_settled` in the news feed, winners.
6. **Season end** – week 18 settling completes every open league with the highest balance (ties
   go to whoever risked less); a league also completes the moment one player is left standing.

## Caching and performance

- Pages are dynamic (they depend on the user's cookie) but every query is indexed for its access
  path; the leaderboard is a `sum()` over `ledger_member_idx`.
- `revalidatePath` after actions keeps the router cache honest; `/api/revalidate` lets jobs
  invalidate tags when they change reference data.
- The client bundle is small: only forms, the logo uploader and the Realtime refresher are client
  components. While a game is on, pages subscribe to `games` changes over one websocket and
  re-render on updates; the cover probability (Stern's normal-margin model, `src/lib/domain/probability.ts`)
  is computed at render time from score, clock and the pick's own line.
- Scaling notes (materialised leaderboard, batching settlement) are in PLAN.md §6b; none are
  needed at the target size (~5k users).

## Observability

- Both runtimes log one JSON object per line (`src/lib/log.ts`, `pickem/log.py`) with a shared
  `request_id`. Never secrets or emails.
- `job_runs` records every job execution; `/admin` shows the last ten.
- `audit_log` records before/after rows for sensitive tables; `/admin/audit` filters by table,
  actor or row. `league_events` is the member-facing history.

## Repository map

```
src/app/            routes: (auth) sign-in/up/reset, (app) dashboard, leagues, picks, profile, admin
src/components/     UI primitives (ui/), feature components (leagues/, picks/, admin/, profile/)
src/lib/            supabase clients, env validation, logging, security headers, domain logic
api/jobs/           Vercel Python functions (thin wrappers only)
pickem/             Python package: HTTP adapter, settings, logging, ESPN provider, jobs, store
supabase/           config, migrations, pgTAP tests, seed, cron schedule
tests/e2e, tests/python   Playwright and pytest
scripts/db/         local Postgres harness for pgTAP without Docker
docs/               this folder
```

See also: [DATABASE.md](DATABASE.md), [JOBS.md](JOBS.md), [WEB.md](WEB.md),
[TESTING.md](TESTING.md), [OPERATIONS.md](OPERATIONS.md), [SECURITY.md](../SECURITY.md).
