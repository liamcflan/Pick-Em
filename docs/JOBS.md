# Jobs (Python)

The data-pull and settlement work runs as Python 3.12 functions deployed on Vercel alongside the
web app. They are thin HTTP wrappers (`api/jobs/*.py`) around plain functions in the `pickem/`
package, scheduled by pg_cron and callable from the admin panel.

## Why Python, why functions

Parsing an undocumented sports API and grading results is scripting work; Python with `httpx` and
`pytest` fixtures is the comfortable tool. Vercel runs Python functions from the same repository
at no extra cost, and pg_cron (already in Supabase) is the scheduler, so there is no worker fleet
to run. See [adr/0001-stack.md](adr/0001-stack.md).

## Anatomy of a job

```
api/jobs/lock_lines.py          # handler = make_handler(run, job_name="lock_lines")
pickem/jobs/lock_lines.py       # run(JobRequest) -> JobResponse; lock_lines(store, ...) pure-ish
pickem/store.py                 # Supabase*Store: the only place that talks to the database
tests/python/test_lock_lines.py # FakeStore + recorded ESPN fixture
```

- **`pickem/vercel.py`** adapts Vercel's `BaseHTTPRequestHandler` convention. It checks the
  `x-job-secret` header with `hmac.compare_digest`, takes or creates an `x-request-id`, puts both
  in log context, and turns exceptions into a 500 JSON body that still carries the request id.
- **Store protocols.** Each job declares a `Protocol` with the handful of queries it needs
  (`LineStore`, `FinalsStore`, `ActionStore`). `pickem/store.py` implements them with
  `supabase-py` using the service-role key. Tests pass fakes, so no job test touches a network or a
  database.
- **Idempotent by design.** Every job can run twice, early, or late: upserts by natural key,
  "already done" checks, and database functions that no-op on repeat calls.
- **`job_runs` row** per execution with the job's summary in `detail`; failures record the error.

## The jobs

| Endpoint                         | Schedule (pg_cron, UTC)         | Body                                  | What it does                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/jobs/health`          | on demand                       | –                                     | Proves the runtime, secret and database connection work.                                                                                                                                                                           |
| `POST /api/jobs/sync_schedule`   | `15 9 * * *` (daily)            | `{year?, weeks?: [1..22]}`            | Fetches ESPN's scoreboard per week, upserts `weeks` (with `opens_at` / `spread_lock_at` computed from the settings by `pickem/schedule.py`) and `games` (matched on `espn_event_id`, teams on `espn_team_id`). Refreshes scores too. |
| `POST /api/jobs/lock_lines`      | `0 11-14 * * 3` (Wed, hourly)   | `{week?, force?}`                     | After the week's `spread_lock_at`: writes an `api` line for every game without a current line; never overwrites an `admin` line unless forced; posts `spreads_locked` to each league the first time.                              |
| `POST /api/jobs/sync_finals`     | `45 * * * *` (hourly)           | –                                     | For weeks that have kicked off and are not settled: re-sync those weeks (scores/status) and call `settle_week` for each. Returns per-week `{ready, picks_settled, eliminated, completed}`.                                          |
| `POST /api/jobs/weekly_action_check` | `5 * * * *` (hourly)        | –                                     | For weeks past `last_deadline_at` and not yet checked: call `weekly_action_check` (auto byes, forced picks). Per-member errors are logged, not fatal.                                                                                |
| `POST /api/jobs/sync_live`       | `*/2 * * * *`                   | –                                     | While a game is in progress (or within 15 min before / 6 h after kickoff): refresh those weeks' scores, clock and status and call `settle_week`. Returns at once otherwise. Realtime streams the rows to open pages.                 |
| `POST /api/jobs/send_reminders`  | `20 * * * *` (hourly)           | –                                     | When a week's last deadline is 1–3 h away: email every opted-in member with nothing in (the database lists who, via `picks_due_reminders`), through Resend; records each send so nobody is nagged twice. No-op without `RESEND_API_KEY`. |

The cron entries are wide on purpose: pg_cron runs in UTC and the jobs decide for themselves
whether there is anything to do, so daylight-saving changes need no edits.

## ESPN provider

`pickem/providers/espn.py` reads the public scoreboard endpoint
(`site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=<year>&seasontype=2&week=<n>`).
It is unofficial, so everything is parsed defensively into `ScoreboardGame` dataclasses:
kickoff, teams, status (mapped through `STATUS_MAP` to our `game_status` enum), scores, period
and clock, and the consensus spread when ESPN BET publishes one. `parse_scoreboard` is pure and
covered by a recorded fixture (`tests/python/fixtures/espn_scoreboard_2026_wk5.json`).
`LIVE_API=1 uv run pytest tests/python/test_espn_live.py` hits the real endpoint when you want to
check the shape has not changed.

## Configuration

| Variable                    | Used by            | Notes                                                       |
| --------------------------- | ------------------ | ----------------------------------------------------------- |
| `JOB_SECRET`                | every job, web     | ≥ 32 random bytes; the only credential the endpoints accept |
| `SUPABASE_URL`              | store              | Falls back to `NEXT_PUBLIC_SUPABASE_URL`                    |
| `SUPABASE_SERVICE_ROLE_KEY` | store              | Never in `src/`; see SECURITY.md                            |
| `APP_URL`                   | reminders          | Links in emails (falls back to `NEXT_PUBLIC_APP_URL`)       |
| `RESEND_API_KEY`, `REMINDER_FROM_EMAIL` | reminders | Optional; leave unset to disable reminder emails     |

`pickem/settings.py` reads these lazily so importing a module never fails; a misconfigured job
answers 500 with a clear message instead of crashing at import.

## Running locally

```bash
uv sync
uv run pytest                    # unit tests, no network
vercel dev                       # serves the Python functions next to Next.js
curl -X POST -H "x-job-secret: $JOB_SECRET" localhost:3000/api/jobs/health
```

Without `vercel dev`, the admin buttons report "Could not reach the job endpoint"; that is expected
under plain `pnpm dev`.

## Adding a job

1. Write `pickem/jobs/<name>.py` with a `Protocol` for its store needs and a pure `def
   <name>(store, ...)` plus `run(request)`.
2. Add the store methods to `pickem/store.py`.
3. Add `api/jobs/<name>.py` (copy an existing one; three lines).
4. Add `<name>` to `JobName` in `src/lib/jobs.ts` if the admin panel should trigger it.
5. Test with a fake store; add a cron line to `supabase/cron/schedule.sql` and a row to the table
   above and to README.
