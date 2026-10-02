# Testing

Four layers, each owning what it is best at. All of them run in CI on every pull request into
`main` and on every push to the open `dev → main` PR.

| Layer      | Tool        | Where                    | Covers                                                                                   | Run                                  |
| ---------- | ----------- | ------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------ |
| TS units   | Vitest      | `src/**/*.test.ts`       | Domain logic: money, spreads, invite codes, event sentences, ranking, avatars, audit diffs, remember-me cookies, CSP builder | `pnpm test`                          |
| Python     | pytest      | `tests/python/`          | ESPN parsing (recorded fixture), week/deadline math across DST, each job with a fake store, the Vercel adapter (auth, request ids, error handling) | `pnpm py:test`                       |
| Database   | pgTAP       | `supabase/tests/*.sql`   | Every RLS policy (allowed + denied), every rule in `place_pick`, budget math, settlement (win/loss/push/void), elimination, winners, byes and forced picks, storage policies, audit trail | `pnpm db:test` or `pnpm db:test:local` |
| End-to-end | Playwright  | `tests/e2e/`             | Sign-up/sign-in/remember-me, security headers and zero CSP violations, league create/join, profile rename, a full simulated week (bet → final → settle → leaderboard/dashboard) on mobile and desktop viewports | `pnpm test:e2e`                      |

`pnpm check` runs the first two plus lint, Prettier and the TypeScript build check. Run it before
every push.

## Database tests in detail

Each `supabase/tests/NN_topic.sql` file:

```sql
begin;
select plan(42);
-- fixtures (auth.users rows create profiles through the trigger)
-- impersonate: pg_temp.as_user('<uuid>') sets role + request.jwt.claims like PostgREST does
-- pg_temp.as_service() does the same for the service role
select throws_ok($$ ... $$, '42501', null, 'members cannot settle a game');
select is(public.settle_game(...), 2, 'two picks graded');
select * from finish();
rollback;
```

- The plan count must equal the number of assertions; the harness fails loudly otherwise.
- Fixtures must coexist with `supabase/seed.sql` (CI seeds before testing): deactivate the seeded
  season, use your own ids and year, and qualify counts by `season_id`.
- Deadline-sensitive cases set kickoffs relative to `now()` (for example "23:59:59 tonight in
  New York" gives a passed deadline and an unstarted game) so they never go stale.
- **Two ways to run.** `pnpm db:test` uses the Supabase CLI (Docker) and is what CI runs.
  `pnpm db:test:local` applies `scripts/db/local-shim.sql`, the migrations and `seed.sql` to a
  throwaway database on a plain Postgres 16 and runs `pg_prove` — no Docker, a second or two per run. The
  shim mimics `auth.uid()`, the Supabase roles and a minimal `storage` schema; behaviours that only
  exist on real Supabase (e.g. the trigger that blocks direct deletes on `storage.objects`) are
  not reproduced, so a green local run is necessary, not sufficient.

  ```bash
  # local harness
  DATABASE_ADMIN_URL=postgresql://postgres:<pw>@localhost:5432/postgres pnpm db:test:local
  ```

## End-to-end tests in detail

- Playwright starts `pnpm start` against a built app (`pnpm build` first) unless
  `PLAYWRIGHT_BASE_URL` is set. Two projects run every spec: Pixel 7 and Desktop Chrome.
- Specs need a running Supabase with the local config (`enable_confirmations = false`, so sign-up
  logs straight in). CI starts one with `supabase start`, which also applies `supabase/seed.sql`
  (active 2026 season, week 5 open).
- `week.spec.ts` plays the settlement job's part with the **local** service-role key
  (`SUPABASE_SERVICE_ROLE_KEY`, exported by CI from `supabase status`). It creates its own game so
  parallel runs never interfere, and skips when the key is absent.
- `pwa.spec.ts` needs no database: it checks the manifest and icons, then installs the service
  worker, cuts the network with `context.setOffline(true)` and expects the offline page and banner.
- In a sandbox without Chromium downloads, point at a preinstalled browser:
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e`.
- Selectors: prefer roles and labels; `data-testid` only where text is not stable
  (`leaderboard`, `available`, `game-<id>`, `pick-result`, `this-week`, `winner-banner`).

## CI

`.github/workflows/ci.yml` has four jobs: **Web** (lint, format, typecheck, unit, build),
**Python** (ruff, pytest, `requirements.txt` in sync with `uv.lock`), **Security** (gitleaks over
full history, `pnpm audit`, `pip-audit`) and **Database** (`supabase start`, pgTAP, build against
the local stack, Playwright). `codeql.yml` analyses both languages. Dependabot opens grouped weekly
update PRs. A weekly `pg_dump` backup workflow is opt-in (`BACKUPS_ENABLED`).

Branch protection on `main` should require all four CI checks; `dev` is the working branch and is
tested through the open release PR.
