# Pick-Em — Project Plan

NFL spread pick'em for friend groups. Everyone starts a season with a bankroll (default $10,000), bets against locked weekly spreads, and whoever has the most when the playoffs start wins the league.

Status: **v0.3 — Phase 0 shipped (PR #2). Game rules replaced by the league's official rules in [docs/RULES.md](RULES.md); §1–§2 updated to match.**

---

## 0. Goals and non-goals

**Goals**
- Rock-solid weekly loop: lock spreads → members pick → games settle → balances and leaderboard update. No manual bookkeeping.
- Fast on phones. Most usage is a Sunday-morning glance and a Sunday-afternoon "am I covering?" check.
- Multiple leagues at once, joined by invite code, each with its own bankrolls.
- Real security posture (Postgres RLS, server-enforced betting rules) so it is credible in a portfolio review, not just among friends.
- Hosting cost as close to $0/month as possible.
- Scales without a rewrite: the same code should serve 20 friends today and thousands of users across hundreds of leagues by turning knobs (plan tiers, cache TTLs, indexes), not by re-architecting. See §6b.

**Non-goals (for now)**
- Real money. Nothing here moves money; it is a scoreboard.
- Native apps. Responsive web + optional PWA install is the mobile story.
- Sports beyond the NFL, bet types beyond point spreads.

---

## 1. Decisions (locked 2026-09-29)

Answers from Liam are marked **Decided**. Items with no answer yet use the stated default and are marked **Default**; say the word and they change.

### Game rules

Superseded by the league's official rules in [docs/RULES.md](RULES.md) (received 2026-09-29). Decisions below restate them in implementation terms; anything marked **Open** needs an answer and has a default.

1. **Payout math.** **Decided: even money.** Bet 1k, win 1k. `price` column kept on lines for the future.
2. **Bet units.** **Decided:** wagers are whole thousands (1k, 2k, …). Min bet 1k. Max = remaining weekly budget. One pick per game per player, editable until that game's deadline. Balances are therefore always whole thousands.
3. **Weekly budget.** **Decided.** `weekly_budget = balance at week open`; wagers deduct from it; winnings are paid at week end and never raise the current week's budget.
4. **Minimum weekly action.** **Decided:** at least 1k must be bet each week unless the player's bye is used that week.
5. **Pushes.** **Decided: a push is a loss.**
6. **Deadline.** **Decided:** each game locks at 11:59 PM America/New_York on the calendar day before its kickoff. **Open:** confirm Eastern is the reference timezone for everyone (default: yes).
7. **Spread source.** **Decided:** Wednesday morning New York Post. The Post has no API, so the app pulls consensus lines Wednesday 8:00 AM ET (configurable) and a **site admin** edits any line to match the paper before that game's deadline (`set_line()`, every version kept and audited). Lines are global because the Post line is the same for every league; per-league overrides can be added later if two leagues ever disagree.
8. **Bye week.** **Decided:** one per player per season, usable in weeks 1–13 only. A week with zero bets by the deadline of the week's last game consumes the bye automatically. **Open:** can a player also declare a bye explicitly in the UI (default: yes, a "Take my bye this week" button, reversible until the last deadline)?
9. **Forced bet.** **Decided:** no bets and no bye left (or week ≥ 14) → system places 1k on the underdog of the week's last game at that game's deadline. Recorded as system-placed in the audit log and shown on the dashboard.
10. **Elimination.** **Decided:** balance 0 → eliminated, leaderboard badge, news-feed event.
11. **Winner.** **Decided:** last player with money wins immediately; otherwise most money at the end of the regular season (week 18). `playoffs_start_at` stays as the season-end marker.
12. **Void games.** **Decided:** abandoned/not-completed games settle as `void` and the wager is refunded. Admin can void a game manually.
13. **Which season.** **Decided: rest of 2026.** Plan: dry run week 6 (lines Wed 14 Oct), go-live week 7 (lines Wed 21 Oct).

### Product

11. **Sign-in.** **Decided: email/password and Google, both offered.**
12. **Roles.** **Decided.** Two separate roles, and one person can hold both:
    - *Site admin* (`profiles.is_site_admin`): global settings, seasons, jobs, all leagues.
    - *Commissioner* (`league_members.role = 'commissioner'`): **many per league**. The creator is the first; any commissioner can promote another member (e.g. the real commish plus you as dev). League name, starting balance, invite code rotation, member removal, promote/demote.
13. **Starting balance scope.** **Default:** global default in admin settings, overridable per league at creation.
14. **Late joiners.** **Default:** full starting balance; leaderboard shows join week.
15. **Picks per league.** **Default:** picks are per league.
16. **Logo constraints.** **Default:** client-side square crop to 256 px WebP, 1 MB upload cap.

### Technical

17. **Stack.** **Decided: Supabase + Vercel** (question 9 in chat). Managed, $0, recognizable. VPS remains a documented fallback in §9.
18. **Data sources.** **Decided:** ESPN public API for schedule, scores, status, win probability **and** the Wednesday consensus spread (its scoreboard carries ESPN BET odds), so no API key is needed. The Odds API stays an optional second provider behind the same interface if ESPN's odds prove unreliable.
19. **Live update mechanism.** **Default:** polling first, Supabase Realtime in Phase 2.
20. **Scale target.** **Decided: design for ~5,000 users / ~500 leagues, run on free tiers sized for 20.** Every choice in §6b is checked against that.
21. **Repo hygiene.** **Decided:** two branches. `dev` is the working branch, pushed to directly and deployed as a Vercel preview. `main` is production and only changes via `dev` → `main` pull requests that require the full CI suite (unit, pgTAP, e2e) to pass, so a release cannot break the live site. Public repo, `docs/adr/`.
22. **Data-pull jobs in Python.** **Decided.** Schedule import, weekly spread lock, and score sync are Python functions deployed on Vercel from the same repo (`api/jobs/*.py`). No extra cost on Hobby, same pg_cron trigger. See §3 "Why this and not X" and §5.

---

### Answered 30 Sep 2026
- **Season end** = the last regular-season week (18); winners are decided when it settles.
- **Pick 'em on the forced bet** → the away team.
- **Mid-season joining** is allowed; a new member starts with the league's starting balance and is
  never forced or bye'd for weeks that closed before they joined.
- **Deleting leagues**: never. Site admins archive instead (`archived_at`); reversible.
- **Google sign-in**: a new Google Cloud project for this app. **Domain**: not yet.
- **Repo**: may go public; nobody but the owner can push, and `main` is protected by CI.

## 2. Game rules spec

Implementation reading of [docs/RULES.md](RULES.md).

- A **season** has weeks 1–18. Each **league** belongs to one season and has its own bankrolls.
- Every **member** starts with the league's starting balance (default $10,000) as an `initial` ledger entry. Money is stored in cents but all wagers are validated as multiples of 100,000 cents (1k).
- **Lines** are pulled Wednesday morning (configurable, default 8:00 AM ET). A commissioner may edit a line until that game's deadline; every version is kept, and a pick keeps the line it was placed on.
- Each game's **deadline** is 23:59 America/New_York on the day before kickoff. `place_pick` rejects anything after it.
- At week open each member's **weekly budget** is snapshotted from their balance. `available = budget − Σ wagers this week`. Wagers are whole thousands, ≥ 1k, ≤ available, one pick per game.
- **Settlement** per game on final: covered → `+2 × wager`; lost or **push** → nothing; `void` (abandoned) → wager refunded. Results are shown as pending until the week's last game is final, at which point a `week_settled` event posts and balances are official.
- **Weekly action check**, run at the deadline of the week's last game, for every non-eliminated member with zero picks that week:
  - week ≤ 13 and bye unused → mark bye used for this week (`league_members.bye_week_id`), post event;
  - otherwise → system places a 1k pick on the underdog of the week's last game, audited as system-placed, post event.
- **Elimination:** balance 0 after week settlement → `eliminated_at`, badge, event, no further picks.
- **Winner:** after any week settles, if exactly one non-eliminated member remains, the league completes and they win. Otherwise at season end the highest balance wins (ties broken by fewer total dollars risked).
- Pick visibility follows the site setting `hide_picks_until_kickoff` (default off; when on, hidden until the game's deadline passes).

## 3. Architecture

```
 Browser (phone/desktop)
   │  HTTPS
   ▼
 Vercel Hobby, single US-East region
   ├─ Next.js 15 (App Router, RSC, Server Actions) — all user-facing pages and actions
   │    supabase-js (anon key + user JWT → RLS enforced)
   └─ Python 3.12 functions at /api/jobs/* — schedule import, spread lock, score sync
        supabase-py with service-role key; only reachable with the job secret header
   │
   ▼
 Supabase project (US-East)
   ├─ Postgres 15 + RLS + SQL functions (place_pick, settle_game, open_week)
   ├─ Auth (email/password, Google) — refresh-token sessions = "remember me"
   ├─ Storage bucket `logos` (RLS on storage.objects)
   ├─ pg_cron + pg_net → calls Next.js job routes on schedule
   └─ Realtime (Phase 2) — pushes `games` row changes to open dashboards

 External: ESPN public API (scores, status, live win prob) · The Odds API (weekly spreads) · Resend (auth emails)
```

**Why this and not X**

| Choice | Why | Rejected alternative |
|---|---|---|
| Next.js on Vercel | Server components give cached, fast first paint; API routes host the jobs; zero-config deploys from GitHub; the most recognizable stack for portfolio readers. | Vite SPA (no server cache, jobs need another host); Remix (fine, less common). |
| Supabase | Postgres with **native RLS tied to `auth.uid()`**, Auth, Storage and cron in one free project. Exactly matches your RLS/data-modeling ask. | Neon + Auth.js + R2: three vendors to wire, RLS possible but you own the JWT→role plumbing. |
| supabase-js with user JWT (not an ORM as a superuser) | The app talks to Postgres *as the user*, so RLS is the real authorization layer, not decoration. | Drizzle/Prisma as a service role bypasses RLS unless you add per-request `SET ROLE`; easy to get wrong. |
| Critical writes as SQL functions | `place_pick` and `settle_game` run inside one transaction with row locks, so budgets can't be overspent by double-submits. | Doing it in JS with two round-trips leaves a race. |
| pg_cron → pg_net → job function | Vercel Hobby cron is capped at once per day, which is useless for score polling. pg_cron runs every minute for free. | Supabase Edge Functions (Deno only, no Python); GitHub Actions cron (5-min minimum, unreliable timing). |
| Data-pull jobs in **Python** on Vercel | Same repo, same deploy, $0. Python is the natural language for fetch/normalize/transform work and for the cover-probability model, and it shows a second language in the portfolio. Boundary is clean: Python writes `games`, `lines`, `job_runs`; the money logic stays in SQL functions. | A separate Python service (Render/Fly/Railway) adds a vendor and $5+/mo; Modal's free credits would work but is a third vendor. |
| Money as `integer` cents | No float rounding, cheap comparisons. | `numeric` is fine too but noisier in TS. |
| UUIDs everywhere, v7 where available | Globally unique, safe to expose in URLs, time-ordered for index locality. | Serial ints leak counts and collide across leagues. |

---

## 4. Data model (Phase 1)

All tables in schema `public`, `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `updated_at` maintained by trigger. Times are UTC; display in the viewer's browser timezone.

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | One per auth user. | `id` (= `auth.users.id`), `display_name`, `avatar_path`, `is_site_admin bool` |
| `seasons` | NFL seasons. | `year int unique`, `regular_season_weeks int (18)`, `playoffs_start_at`, `is_active` |
| `weeks` | 18 per season. | `season_id`, `week_number`, `opens_at`, `spread_lock_at`, `first_kickoff_at`, `last_game_id`, `last_deadline_at` (deadline of the last game; drives the bye/forced-bet job), `settled_at`, unique `(season_id, week_number)` |
| `teams` | 32 rows, seeded. | `abbreviation unique`, `name`, `logo_url`, `espn_team_id` |
| `games` | One per NFL game. | `week_id`, `home_team_id`, `away_team_id`, `kickoff_at`, `deadline_at` (23:59 ET the day before; generated), `espn_event_id unique`, `status enum(scheduled, in_progress, final, postponed, void)`, `home_score`, `away_score`, `period`, `clock`, `last_synced_at` |
| `lines` | Immutable spread versions. | `game_id`, `home_spread numeric(4,1)` (negative = home favored), `price int default -110` (stored, unused while payout is even money), `source enum(api, commissioner)`, `set_by uuid null`, `locked_at`, `is_current bool` (partial unique index: one current per game) |
| `leagues` | A friend group in a season. | `season_id`, `name`, `invite_code text unique`, `created_by`, `starting_balance_cents int`, `status enum(open, locked, complete)`, `winner_user_id` |
| `league_members` | Membership + role; many commissioners allowed. | PK `(league_id, user_id)`, `role enum(member, commissioner)`, `joined_week_id`, `bye_week_id null` (the one bye, weeks 1–13), `eliminated_at`, `eliminated_week_id` |
| `league_events` | News feed shown on every member's dashboard. | `league_id`, `kind enum(member_joined, member_eliminated, bye_used, forced_pick, line_edited, week_settled, spreads_locked, season_complete, commissioner_note)`, `actor_user_id null`, `payload jsonb` |
| `week_budgets` | Snapshot of bankroll at week open. | PK `(league_id, user_id, week_id)`, `budget_cents int` |
| `picks` | A wager. | `league_id`, `user_id`, `game_id`, `line_id`, `side enum(home, away)`, `wager_cents int` (check: multiple of 100000, ≥ 100000), `placed_by enum(member, system)` (forced bets), `status enum(open, won, lost, push, void)`, `settled_at`, unique `(league_id, user_id, game_id)` |
| `ledger` | Every balance movement; balance = sum. | `league_id`, `user_id`, `week_id`, `pick_id null`, `kind enum(initial, wager, payout, refund, adjustment)`, `amount_cents int` (signed), `note` |
| `app_settings` | Site-wide config, single row. | `spread_lock_day int` (default 3 = Wednesday), `spread_lock_time time` (default 08:00), `timezone text` (America/New_York), `default_starting_balance_cents`, `bet_unit_cents` (default 100000), `hide_picks_until_kickoff bool default false`, `odds_provider`, `score_poll_interval_s` |
| `job_runs` | Observability for cron jobs. | `job_name`, `request_id`, `started_at`, `finished_at`, `status`, `detail jsonb` |
| `audit_log` | Append-only before/after history for sensitive tables (picks, memberships, league and site settings, profiles). Populated only by the `audit_row()` trigger; update/delete blocked for every role. | `table_name`, `row_id`, `action`, `actor_id`, `actor_role`, `request_id`, `old_data jsonb`, `new_data jsonb` |

**Derived views**
- `league_balances` — `select league_id, user_id, sum(amount_cents)` from ledger. Materialized in Phase 1 only if measured slow (it will not be, at this size).
- `leaderboard` — balances joined to profiles with rank window function.

**RLS matrix (Phase 1)**

| Table | select | insert | update | delete |
|---|---|---|---|---|
| profiles | any authenticated user (display fields only) | own row (trigger on signup) | own row | — |
| seasons, weeks, teams, games, lines, app_settings(read subset) | authenticated | service role only | service role only | — |
| leagues | members of that league, or anyone with the invite code via a `join_league(code)` function | authenticated (creator becomes first commissioner) | any commissioner of that league | any commissioner while `status = open` and no picks |
| league_members | members of the same league | via `join_league()` function only | any commissioner (role, promote/demote; cannot demote the last commissioner) | any commissioner, or self (leave) |
| league_events | members of the same league | commissioners (`commissioner_note`); service role for system events | — | — |
| week_budgets | own rows + same-league members' rows | service role via `open_week()` | — | — |
| picks | own always; same-league rows where `hide_picks_until_kickoff = false` OR `game.kickoff_at <= now()` | via `place_pick()` function only (rejects eliminated members) | via `place_pick()`/`delete_pick()` only, before kickoff | same |
| ledger | own rows; same-league members' rows | service role via settlement | — | — |
| audit_log | own actions, own rows, or site admin | trigger only (`security definer`) | blocked by trigger | blocked by trigger |
| storage `logos` | public read | path must start with `auth.uid()` | same | same |

Site-admin routes check `profiles.is_site_admin` **and** RLS policies also gate the admin-only tables, so a leaked anon key cannot elevate.

---

## 5. Core flows

All three jobs below are Python (`api/jobs/`). Each validates the `X-Job-Secret` header, writes a `job_runs` row, and calls `POST /api/revalidate` on the Next.js side with the cache tags it touched.

**Weekly spread lock (cron: configured day/time)**
1. pg_cron fires `POST /api/jobs/lock-spreads` with the job secret.
2. The function fetches the week's games from ESPN (creates any missing `games` rows), fetches spreads from The Odds API, matches by team + kickoff.
3. Inserts a new `lines` row per game, flips `is_current`. Never edits an existing line.
4. Calls `open_week(week_id)`: for every league in the active season and every member, inserts `week_budgets` with their current balance.
5. Revalidates the Next.js cache tag `spreads:{week}`.

**Placing a pick (server action → `place_pick(league, game, side, wager)`)**
- In one transaction with `select … for update` on the member's budget row: check membership and not eliminated, `now() < game.deadline_at`, `game.status = scheduled`, `wager` is a multiple of the bet unit and ≥ one unit, `wager ≤ budget − Σ open wagers`, upsert the pick with the current `line_id`, write the `wager` ledger entry (or adjust if editing). Returns the new available amount. The UI updates optimistically and reverts on error.

**Weekly action check (cron: at each week's `last_deadline_at`; Python)**
- For every league in the season and every non-eliminated member with zero picks this week: if `week_number ≤ 13` and `bye_week_id is null` → set the bye and post `bye_used`; else → `place_system_pick(member, last_game, underdog, 1 unit)` and post `forced_pick`. Idempotent per (league, member, week).

**Score sync (cron: every minute; Python; exits instantly if no game is live or within 30 min of kickoff)**
- Fetch ESPN scoreboard once (one request covers every game). Update `games` rows that changed. When a game turns `final`, call `settle_game(game_id)`: for every open pick on that game compute won / lost (push counts as lost) / void against the pick's *own* `line_id`, write payout or refund ledger rows, mark picks settled. When the week's last game is final, `settle_week(week_id)` posts `week_settled`, runs elimination, and checks for a sole survivor. Then for each affected member: if balance = 0 and no open picks, set `eliminated_at` and insert a `member_eliminated` league event. Idempotent: re-running on a settled game is a no-op.
- Phase 2: also store `home_win_probability` from ESPN and compute cover probability per open pick in Python (§7), written to `picks.cover_probability` so the dashboard only reads.

**Season end**
- After any `settle_week`: if exactly one non-eliminated member remains, complete the league with them as winner. Nightly job: if `now ≥ playoffs_start_at` and league is `open`, set `status = complete`, `winner_user_id = top of leaderboard`.

---

## 6. Performance and caching

- **Server-rendered, cached reads.** Spreads, games, and leaderboard are fetched in React Server Components and cached with `unstable_cache` keyed by tag (`spreads:{week}`, `leaderboard:{league}`, `games:{week}`). Jobs call `revalidateTag` after they write, so caches are invalidated exactly when data changes instead of on a timer.
- **Live data has a short TTL.** `games:{week}` uses `revalidate: 30` during game windows (Phase 2), so 20 people refreshing on Sunday produce at most two DB reads a minute.
- **Single region.** Vercel functions and the Supabase project both in `us-east-1` so a page render is one ~5 ms hop, not a cross-continent round trip.
- **Small payloads.** Dashboard is one query for "my picks this week + the games they reference"; leaderboard is one query. No N+1.
- **Optimistic pick UI** with `useOptimistic`; the spread sheet is fully usable offline-ish between taps.
- **Images.** Logos are resized to 256 px WebP in the browser before upload, served from Supabase's CDN with long cache headers. Team logos are static assets in the repo.
- **Budget target:** dashboard TTFB < 300 ms warm, < 1 s cold (Vercel cold start + Supabase pooler). Measured in CI with Lighthouse on a preview deploy.

---

## 6b. Scalability

The architecture is stateless at the app tier and append-only at the data tier, which is what lets it scale by configuration rather than by rewrite.

**What the design already does for scale**
- **Stateless app tier.** Next.js on Vercel functions holds no session or game state in memory; every instance is interchangeable, so Vercel scales instances horizontally on its own. Sessions live in cookies validated against Supabase Auth.
- **Cache in front of every hot read.** Spreads, games, and leaderboards are cached per tag and invalidated by the jobs that write them, so the number of DB reads per minute is bounded by the number of data changes, not by the number of viewers. 5,000 users refreshing at 1:00 PM produce the same handful of DB queries as 20 users do.
- **Fan-in, not fan-out, for live data.** One ESPN request per minute serves everyone. External API cost is O(1) in users. Realtime (Phase 2) pushes one row change to N subscribers instead of N clients polling.
- **Append-only ledger + snapshot budgets.** Balances are `Σ ledger`, which is a sum over a per-user index and stays fast at millions of rows; `week_budgets` snapshots mean the budget check in `place_pick` touches one row, not a history scan. Leaderboards go materialized (refreshed by the settlement job) the moment `explain analyze` says so.
- **Idempotent, lock-safe jobs.** `settle_game` and `lock-spreads` are safe to re-run and hold row locks, so they can be retried, run concurrently by accident, or split across workers without corrupting data.
- **Everything keyed by `league_id`.** Every user-facing query filters on `(league_id, …)` with a matching composite index. Data never crosses leagues, so if a single Postgres ever becomes the bottleneck, leagues shard cleanly.
- **Indexes from day one:** `picks(league_id, user_id, game_id)`, `picks(game_id) where status='open'`, `ledger(league_id, user_id)`, `games(week_id, kickoff_at)`, `lines(game_id) where is_current`.

**Knobs, in the order you would turn them (with costs)**

| Step | Trigger | Change | Cost |
|---|---|---|---|
| 1 | > ~500 MAU or Sunday latency creeping | Supabase Pro + Small compute (dedicated CPU, 2 GB RAM, connection pool 200) | $25 + $15/mo |
| 2 | Need > 1 cron per day on Vercel, > 100 GB bandwidth, or > 2 seats | Vercel Pro | $20/mo |
| 3 | Leaderboard query > 50 ms | Materialized `leaderboard` view refreshed by `settle_game` | $0 |
| 4 | Realtime > 500 concurrent connections | Supabase Pro raises to 500; Medium compute beyond | included / +$60 |
| 5 | ESPN rate-limits or wobbles under one poller | Move score sync to a licensed feed (SportsDataIO ~$50/mo) or self-host a poller | $0–50 |
| 6 | Job latency matters (10k+ picks settling per game) | Batch `settle_game` in chunks; move jobs to a queue (pg-boss on the same Postgres, no new infra) | $0 |
| 7 | Read-heavy at 100k+ users | Supabase read replicas + Vercel edge caching of public pages | ~$100+/mo |

At scale target (b), steps 1–3 are the expected ceiling: **roughly $60/mo**. Nothing on the list requires touching the schema or the domain code.

**What I deliberately did not add now:** Redis, a message queue, microservices, or a separate API service. Each would be premature for (b) and would make the free-tier build cost money and time. The plan notes where each would slot in if (c) ever happens.

---

## 7. Live scores and cover probability (Phase 2)

- **Scores/status:** ESPN scoreboard endpoint (`site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`). One call returns every game with score, quarter, clock, possession, and a pre-game spread. Unofficial, so the client is wrapped in a `ScoreProvider` interface with retries and a circuit breaker; if it fails for 15 min, the dashboard shows "scores delayed" rather than stale numbers presented as live.
- **Win probability:** ESPN publishes an in-game `probabilities` feed per event. Useful as-is for "will my team win".
- **Cover probability (what a spread bettor actually cares about):** compute in-house, in Python inside the score-sync job (numpy/scipy `norm.cdf`), stored on the pick row. Model: remaining-margin ~ Normal(μ, σ) where μ = `(pregame_spread) × fraction_of_game_remaining` and σ = `13.5 × sqrt(fraction_of_game_remaining)` (13.5 ≈ historical std dev of NFL final margins). `P(cover) = P(current_margin + remaining_margin > −pick_spread)`. Pure function, pytest-covered, ~20 lines. It is a well-known approximation (Stern 1991) and a good talking point in an interview; it can later be replaced by a logistic model trained on play-by-play if you want to go further.
- **Delivery:** Phase 2a polls every 30 s while a game the user has a pick in is live; Phase 2b switches to Supabase Realtime on `games` (free tier: 200 concurrent connections, 2M messages/month; a full Sunday for 20 users is ~50k messages).

---

## 8. Security, logging and auditability

- **RLS on every table**, default deny, policies as in §4. A `pgTAP` test suite asserts each policy (e.g. "user A cannot read user B's unlocked pick").
- **All betting rules enforced in Postgres functions** (`security definer`, `search_path` pinned) so no client bug or crafted request can overspend or bet after kickoff.
- **Auth:** Supabase Auth with `@supabase/ssr` cookies. "Remember me" = persistent refresh-token cookie (default 30-day sliding, configurable); unchecked = session cookie. Refresh-token rotation and reuse detection are on by default.
- **Secrets:** service-role key and job secret live only in Vercel env vars and are read only by the Python job functions. The Next.js app never imports the service-role key at all (an ESLint `no-restricted-imports` rule enforces this). Anon key + URL are the only values shipped to the browser.
- **Job endpoints:** reject any request without the `X-Job-Secret` header (constant-time compare), and are excluded from the Next.js middleware/session layer entirely.
- **Admin surface** at `/admin` gated by `is_site_admin` in middleware and again in each server action.
- **Uploads:** MIME + magic-byte check, size cap, path scoped to `auth.uid()/`, no user-controlled filenames.
- **Rate limits:** Supabase Auth's built-in limits on sign-in; Vercel WAF basic rules. Invite codes are 8 chars from a 32-symbol alphabet (~1e12 space) and can be rotated by the commissioner.
- **Dependency hygiene:** Dependabot, `npm audit` in CI, lockfile committed.
- **Structured logging (ADR 0003):** both runtimes emit one JSON object per line with the same field names (`ts`, `level`, `msg`, `request_id`, `job`). Every job invocation carries a request id through its logs, its response and its `job_runs` row. Never log secrets, tokens or emails.
- **Audit trail (ADR 0003):** `audit_log` records who changed what and when, with full before/after rows, for picks, memberships, leagues, settings and profiles. Disputes ("I picked the other side") are answered by reading the pick's history. Members see rows for their own actions; site admins see everything. The admin panel gets an audit viewer in Phase 1.

---

## 9. Cost estimate

Verified against provider pricing pages on 2026-09-29. Free tiers change; re-check before the 2027 season.

| Service | Tier | What we use | Monthly cost |
|---|---|---|---|
| Vercel | Hobby | ~5k function invocations/week on game weeks (Next.js + Python), < 1 GB bandwidth | **$0** (non-commercial use is within the Hobby terms; Python runtime included) |
| Supabase | Free | DB ~20 MB/season (limit 500 MB), storage < 20 MB (limit 1 GB), 20 MAU (limit 50k), pg_cron, Auth | **$0** |
| The Odds API | Free | 18–36 credits/season of 500/month | **$0** |
| ESPN public API | — | ~1k requests/week in season, cached | **$0** |
| Resend (auth emails) | Free | < 100 emails/month (limit 3,000) | **$0** |
| Domain (optional) | — | e.g. `yourname-pickem.com` | ~$1/mo ($12/yr); `*.vercel.app` is free |
| Sentry (optional) | Developer | error tracking, 5k events/month | $0 |
| **Total** | | | **$0–$1 / month** |

**Known free-tier caveats**
- Supabase Free pauses a project after 7 days of inactivity. In season there is always activity; in the off-season it will pause and you restore it with one click (data is retained). If that annoys you: Supabase Pro is $25/mo and adds daily backups, which is the only paid upgrade I would consider.
- Supabase Free has no automated backups. Mitigation in Phase 0: a weekly GitHub Actions job runs `pg_dump` into a private repo/artifact. Free.
- Vercel Hobby cron is once-per-day, which is why the scheduler lives in pg_cron.
- ESPN can change its API without notice; the provider interface and The Odds API fallback for scores (2 credits/call, ample) cover this.

**"Comfortable" tier if you ever want it:** Supabase Pro ($25) + Vercel Pro ($20) = **$45/mo**. Not needed for 20 users.

**Self-host alternative:** one Hetzner/DigitalOcean VPS ($5–6/mo) running Postgres + Next.js in Docker, Caddy for TLS, cron on the box. Cheaper than the comfortable tier, but you own backups, upgrades and uptime.

---

## 10. Phases

Calendar (2026 season, spreads lock Tuesdays):

| Date | Milestone |
|---|---|
| Tue 29 Sep | Plan locked. Phase 0 starts. |
| Sun 4 Oct | Phase 0 done: deployed shell, auth, RLS, CI. |
| Tue 13 Oct (wk 6 lock) | Phase 1 dry run: you + 2–3 friends play week 6 on the real site. |
| Tue 20 Oct (wk 7 lock) | **Go-live.** Both leagues created, balances reset, everyone invited. |
| Nov | Phase 2 during the season: live scores, cover probability, Realtime. |
| Sun 3 Jan 2027 | Week 18. Winners declared when playoffs start. |
| Jan–Feb | Phase 3 polish + portfolio README. |

### Phase 0 — Foundation (29 Sep → 4 Oct)
Goal: an empty but production-shaped app deployed with CI, migrations, auth and RLS working end to end.
- Next.js 15 + TypeScript strict + Tailwind + shadcn/ui; ESLint, Prettier, Husky pre-commit.
- Supabase CLI: local stack via Docker, SQL migrations in `supabase/migrations/`, `supabase gen types` wired to `npm run db:types`.
- Migration 0001: `profiles`, `app_settings`, `job_runs`, `audit_log` + `audit_row()` trigger, RLS enabled, column-level grants, signup trigger.
- Structured JSON loggers in both runtimes with request ids.
- Auth pages: sign in / sign up / reset, Google button, remember-me checkbox, protected `/dashboard` shell.
- Python toolchain: `uv` for deps, `ruff` lint/format, `pytest`; `api/jobs/health.py` as the first deployed function proving the Vercel Python runtime and job secret work.
- CI (GitHub Actions): ESLint + tsc + Vitest for the app, ruff + pytest for `api/`, `supabase db reset` + pgTAP, Playwright smoke on preview URL.
- Deploy: Vercel project linked to `main`, preview deploys per PR, env vars documented in `.env.example`.
- `docs/adr/0001-stack.md` … capturing the decisions from §1.
- Weekly `pg_dump` backup workflow.

**Done when:** a new user can sign up on the deployed URL, close the browser, reopen a day later, and still be signed in; CI is green; RLS tests pass.

### Phase 1 — Season-ready MVP (5 Oct → 20 Oct)
Goal: a league can run a full week without you touching the database. Ordered so the dry run on 13 Oct has items 1–6.
1. **Reference data:** seasons, weeks, teams, games; Python `sync-schedule` job importing the 2026 schedule from ESPN; admin button to run it.
2. **Leagues:** create league, invite code, join by code, member list, multiple commissioners (promote/demote), commissioner settings (name, starting balance, rotate code, remove member).
3. **Spread lock job** (Wednesday morning) + `open_week()` + admin settings for day/time/timezone/default balance/bet unit/pick visibility, manual "re-pull now", and **commissioner line editing** to match the New York Post (audited, `line_edited` event).
4. **Picks UI:** mobile-first weekly sheet: each game shows both teams, spread, kickoff and **deadline** in local time, tap-to-pick side, wager stepper in 1k units with "available this week" always visible; edit/delete before the deadline; locked state after; "take my bye" toggle (weeks 1–13).
5. **Settlement:** `settle_game()` (push = loss, void = refund) + `settle_week()` + hourly `sync-finals` job (finals only; live comes in Phase 2). **Weekly action check** job (bye / forced 1k underdog). Ledger, balances, week_budgets, elimination, sole-survivor win. Audit trigger attached to `picks`, `league_members`, `leagues`, `lines`.
6. **Dashboard:** leaderboard (rank, logo, name, balance, week delta, eliminated badge), my picks this week with result badges, **league news feed** (joins, eliminations, spreads locked, week settled, commissioner notes), quick links to pick/view spreads.
7. **Profile:** display name, logo upload with client-side crop/resize.
8. **Admin panel:** settings form, job runs table with re-run buttons, season editor (`playoffs_start_at`), league list, audit viewer (search by member or pick).
9. **Season end:** nightly job marks leagues complete and records the winner; dashboard shows a winner banner and news event.
10. **Tests:** Vitest (payout, budget, deadline math incl. DST), pytest with recorded API fixtures (ESPN/Odds parsing, spread matching, no live network in CI), pgTAP (every RLS policy; `place_pick` rejections: after deadline, non-unit wager, over budget, eliminated member; push = loss; void = refund; bye and forced-pick logic), Playwright (sign up → create league → join with second user → pick → simulate final → leaderboard and news feed update).

**Done when:** two test users in two different leagues can play a simulated week end to end on the deployed site, and every table has RLS tests.

**Status (30 Sep 2026, on `dev`):** items 1–7 and 10 are built and covered by CI (pgTAP on a
real Supabase, Playwright including the simulated week). Item 8 is done except the season editor
and league list; item 9 is folded into `settle_week` (a league completes when one player is left
or when the last regular-season week settles), so no nightly job is needed. Remaining before
go-live: the deploy checklist in [OPERATIONS.md](OPERATIONS.md), then the 13 Oct dry run.

**Status (1 Oct 2026):** live scores (`sync_live` every two minutes while games are on), Realtime
refresh of the picks page and dashboard, the in-game cover probability, pick history with per-member
stats, and the picks-due reminder email (opt-out on the profile; needs a Resend key) are on `dev`.

**Status (2 Oct 2026):** Phase 3 started early. The app is installable (manifest, icons, a
network-only service worker with an offline page), shows an offline banner, and offers an install
hint on the dashboard.

### Phase 2 — Live (Nov, in season)
- Minute-level score sync during game windows; live status (quarter, clock, score) on dashboard picks.
- Cover-probability model + ESPN win probability shown per live pick.
- Client polling → Supabase Realtime.
- Pick history page and per-member stats (record ATS, ROI, biggest win).
- Email/push reminder "picks lock in 2 hours and you have $X unbet" (optional).

### Phase 3 — Polish and portfolio (Jan–Feb 2027)
- ~~PWA manifest + install prompt + offline shell.~~ Done 2 Oct 2026.
- Multi-season support: archive view, all-time records.
- README with architecture diagram, screenshots, ADR index, "how a bet flows through the system" walkthrough for interviews.
- Lighthouse ≥ 90 on mobile; accessibility pass.

---

## 11. Repo layout (proposed)

```
pick-em/
├─ app/                      # Next.js App Router (TypeScript)
│  ├─ (auth)/ sign-in, sign-up, reset
│  ├─ (app)/ dashboard, leagues/[id]/picks, leagues/[id]/spreads, profile
│  ├─ admin/
│  └─ api/revalidate/        # cache-tag invalidation, called by the Python jobs
├─ api/jobs/                 # Vercel Python functions: thin wrappers only (every file here is an endpoint)
│     lock_spreads.py, sync_scores.py, sync_schedule.py, close_season.py, health.py
├─ pickem/                   # Python shared package: vercel.py (adapter), log.py, settings.py,
│     jobs/ (implementations), providers/ (espn.py, odds_api.py), cover_probability.py
├─ tests/python/             # pytest + recorded JSON fixtures
├─ pyproject.toml, uv.lock, requirements.txt (exported from uv.lock for Vercel)
├─ components/               # UI (shadcn) + feature components
├─ lib/
│  ├─ supabase/ (server, client, middleware helpers)
│  ├─ domain/ (payout.ts, budget.ts — display-side pure helpers, unit-tested)
│  └─ cache.ts (tags, revalidate helpers)
├─ supabase/
│  ├─ migrations/            # SQL, one file per change
│  ├─ tests/                 # pgTAP
│  └─ seed.sql               # teams, a demo season
├─ tests/e2e/                # Playwright
├─ scripts/db/               # local Postgres test harness (no Docker)
├─ docs/ PLAN.md, adr/
└─ .github/workflows/ ci.yml, backup.yml
```

---

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| ESPN API changes or blocks | Live scores stop | Provider interface; The Odds API scores fallback; dashboard degrades to "scores delayed" |
| Two runtimes in one repo (TS + Python) | Local dev friction, route conflicts | Python lives only under root `api/`; Next.js routes stay under `app/api/revalidate`; `vercel dev` runs both; CI runs both toolchains on every PR |
| Python cold start on Vercel (~1 s) | Score sync runs late | Irrelevant at once-per-minute; job records its own timestamps so drift is visible in `job_runs` |
| Free-tier project pause in off-season | Site down until restored | Documented one-click restore; optional Pro upgrade |
| Spread matching errors (team name mismatch, doubleheaders) | Wrong line locked | Match on ESPN event id where possible, team abbreviation + kickoff window otherwise; admin per-game re-pull; job logs the unmatched list |
| Double-submit / race on wager | Overspend | Row lock inside `place_pick`; unique pick per game |
| Time zones | Picks lock at wrong time | Store UTC only; test around DST change (first Sunday in November is a game day) |
| Scope creep before the season | Nothing ships | Phase 1 list is frozen once you sign off on §1 |
| Sunday 1:00 PM thundering herd at larger scale | Slow dashboard | Tag-based cache means viewers do not hit the DB; load-test the dashboard with k6 against a preview deploy in Phase 3 |

---

## 13. Next step

Phase 0 begins on branch `phase-0/foundation`, one PR per bullet. First PR: Next.js scaffold + Supabase local stack + CI. Open items still on defaults (5–9, 13–16, 18–19, 21) can be changed any time before the feature that uses them ships.
