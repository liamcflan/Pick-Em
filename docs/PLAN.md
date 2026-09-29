# Pick-Em — Project Plan

NFL spread pick'em for friend groups. Everyone starts a season with a bankroll (default $10,000), bets against locked weekly spreads, and whoever has the most when the playoffs start wins the league.

Status: **DRAFT v0.1 — waiting on answers to the decisions in §1 before Phase 0 starts.**

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

## 1. Decisions I need from you

Each item has my recommended default. Reply with the number and either "default" or your answer. Anything unanswered, I will build with the default and note it in the ADR log.

### Game rules

1. **Payout math.** (a) Even money: bet 100, win 100. (b) Sportsbook-style -110: bet 110 to win 100. **Default: (a) even money.** Simpler to explain, and the leaderboard is about picking well, not juice.
2. **Weekly budget rule.** My reading of "you can bet what you start with at the week": at week open, `weekly_budget = current balance`. Every wager placed that week is deducted from the budget. Thursday winnings raise your balance but not your budget. **Confirm.** Follow-up: if you lose Thursday, is your Sunday budget still the full week-open amount (already deducted the wager, so yes), or does it shrink further? **Default: only the wager is deducted, nothing further.**
3. **Bet limits.** Min wager? Max wager (default: entire weekly budget)? Can a member bet multiple games in a week (default: yes)? Multiple bets on the same game (default: no, one pick per game, editable until kickoff)? **Default: min $1, max = remaining weekly budget, one pick per game.**
4. **Pushes.** Game lands exactly on the spread. **Default: refund the wager.** (Half-point spreads avoid most of these anyway.)
5. **Lock time.** Picks on a game lock at that game's scheduled kickoff. **Default: yes, per game, not per week.**
6. **Spread lock day/time.** Spreads pulled and frozen once weekly at a configurable day/time. **Default: Tuesday 10:00 AM America/New_York.** Whatever the spread is at pull time is the spread for the whole week, for everyone in every league. (If a game's line is missing at pull time, admin can re-pull that game manually.)
7. **Zero balance.** If someone hits $0, are they out for the season, or do they sit at $0 and stay on the leaderboard? **Default: they stay on the leaderboard at $0 and cannot bet.**
8. **Pick visibility.** Can members see each other's picks before kickoff? **Default: hidden until that game kicks off, then visible to the whole league.** (Prevents copying, and makes the Sunday dashboard more fun.)
9. **Season boundary.** Regular season weeks 1–18; winner declared when the playoffs start. **Default: yes; admin can override the "playoffs start" date.** Are bye-week Thursdays/International games all fair game? Default: every regular-season game is bettable.
10. **Which season?** Today is 29 Sep 2026, NFL week 4. Do you want this live for the rest of *this* season (tight: ~3 weeks to a usable Phase 1), or built properly for the 2027 season with testing on late-2026 games? **Default: target 2027 kickoff, dogfood on the remaining 2026 weeks.**

### Product

11. **Sign-in method.** (a) Email + password. (b) Google sign-in. (c) Both. **Default: (c)**, with email verification off for friends-only. Password reset emails need an SMTP provider (Resend free tier) because Supabase's built-in mailer is rate-limited to a handful per hour.
12. **Admin model.** (a) One site admin (you) controls everything. (b) Site admin for global settings (pull schedule, data source, seasons) plus a *commissioner* per league who controls that league's name, starting balance, invite code, and can kick members. **Default: (b).**
13. **Starting balance scope.** Global default in admin settings, overridable per league by the commissioner at league creation. **Default: yes.** Changing it mid-season only affects new leagues.
14. **Late joiners.** Someone joins a league in week 6. Do they start with the full starting balance? **Default: yes, full starting balance; the leaderboard shows their join week.**
15. **Picks per league or shared?** If you are in two leagues, can you pick differently in each? **Default: picks are per league.**
16. **Logo constraints.** Square crop client-side, resize to 256px WebP before upload, 1 MB cap on the original. **Default: yes.** Any moderation concern, or is it friends only?

### Technical

17. **Stack.** Next.js (App Router, TypeScript) on Vercel Hobby + Supabase (Postgres, Auth, Storage, RLS, pg_cron). Detail in §3. **Default: yes.** Alternative if you prefer owning the box: one $5/mo VPS with Docker Compose. More ops, more to explain in an interview, but no free-tier caveats.
18. **Live data source.** ESPN's undocumented public API for scores/status/in-game win probability (free, no key, could change without notice) plus The Odds API free tier (500 credits/mo, documented, keyed) for the weekly spread lock. **Default: both**, with a provider interface so either can be swapped. If you want zero external accounts, ESPN also returns a spread on the scoreboard and I can use that alone.
19. **Live update mechanism.** Phase 2 only. (a) Client polls every 30–60 s while games are live. (b) Supabase Realtime pushes changes from the `games` table. **Default: start with (a), upgrade to (b) in Phase 2** because it is a better portfolio story and stays in the free tier.
20. **Scale target.** "Scalable" needs a number to design against. (a) Friends: ≤ 100 users, ≤ 10 leagues. (b) Community: ~5,000 users, ~500 leagues, all hitting the dashboard in the same Sunday 1:00 PM window. (c) Product: 100k+ users. **Default: design for (b), run on free tiers sized for (a).** Every choice in §6b is checked against (b); (c) would add a queue and read replicas, which I have noted but would not build now.
21. **Repo hygiene.** Public repo from day one? Conventional commits, PR-based workflow with CI on every PR, `docs/adr/` for decisions? **Default: yes to all.**

---

## 2. Game rules spec (as currently understood)

Assumes defaults above; will be revised from your answers.

- A **season** has weeks 1–18 and a `playoffs_start_at`. Each **league** belongs to one season.
- A **league** has a starting balance (default $10,000). Each **member** gets that balance in that league only.
- Each week, at the configured pull time, the app **locks spreads** for every game in that week. Lines are stored with the timestamp and source and never mutated; a re-pull creates a new line version and voids nothing already picked (existing picks keep the line they were placed on).
- At week open, each member's **weekly budget** is snapshotted from their balance. `available = weekly_budget − Σ(open wagers this week)`.
- A **pick** = league + member + game + side (home/away) + wager + the line version it was placed on. Editable or deletable until kickoff. Server rejects any wager exceeding `available`.
- On final: team covers → member credited `wager × 2` (even money); loses → nothing; push → wager refunded. A **ledger** entry records every movement. Balance is always `Σ ledger`.
- Leaderboard ranks members by balance; ties broken by fewer total wagers risked.
- When `now ≥ playoffs_start_at`, the league is frozen and the top balance is marked the winner.

---

## 3. Architecture

```
 Browser (phone/desktop)
   │  HTTPS
   ▼
 Next.js 15 (App Router, RSC, Server Actions)  ── Vercel Hobby, single US-East region
   │  supabase-js (anon key + user JWT → RLS enforced)
   │  service-role only inside /api/jobs/* routes (secret header)
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
| pg_cron → pg_net → Next.js route | Vercel Hobby cron is capped at once per day, which is useless for score polling. pg_cron runs every minute for free and keeps all job logic in the one TypeScript codebase. | Supabase Edge Functions (a second Deno codebase); GitHub Actions cron (5-min minimum, unreliable timing). |
| Money as `integer` cents | No float rounding, cheap comparisons. | `numeric` is fine too but noisier in TS. |
| UUIDs everywhere, v7 where available | Globally unique, safe to expose in URLs, time-ordered for index locality. | Serial ints leak counts and collide across leagues. |

---

## 4. Data model (Phase 1)

All tables in schema `public`, `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `updated_at` maintained by trigger. Times are UTC; display in the viewer's browser timezone.

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | One per auth user. | `id` (= `auth.users.id`), `display_name`, `avatar_path`, `is_site_admin bool` |
| `seasons` | NFL seasons. | `year int unique`, `regular_season_weeks int (18)`, `playoffs_start_at`, `is_active` |
| `weeks` | 18 per season. | `season_id`, `week_number`, `opens_at`, `spread_lock_at`, `first_kickoff_at`, `last_kickoff_at`, unique `(season_id, week_number)` |
| `teams` | 32 rows, seeded. | `abbreviation unique`, `name`, `logo_url`, `espn_team_id` |
| `games` | One per NFL game. | `week_id`, `home_team_id`, `away_team_id`, `kickoff_at`, `espn_event_id unique`, `status enum(scheduled, in_progress, final, postponed, cancelled)`, `home_score`, `away_score`, `period`, `clock`, `last_synced_at` |
| `lines` | Immutable spread versions. | `game_id`, `home_spread numeric(4,1)` (negative = home favored), `source`, `locked_at`, `is_current bool` (partial unique index: one current per game) |
| `leagues` | A friend group in a season. | `season_id`, `name`, `invite_code text unique`, `commissioner_id`, `starting_balance_cents int`, `status enum(open, locked, complete)`, `winner_user_id` |
| `league_members` | Membership + role. | PK `(league_id, user_id)`, `role enum(member, commissioner)`, `joined_week_id` |
| `week_budgets` | Snapshot of bankroll at week open. | PK `(league_id, user_id, week_id)`, `budget_cents int` |
| `picks` | A wager. | `league_id`, `user_id`, `game_id`, `line_id`, `side enum(home, away)`, `wager_cents int > 0`, `status enum(open, won, lost, push, void)`, `settled_at`, unique `(league_id, user_id, game_id)` |
| `ledger` | Every balance movement; balance = sum. | `league_id`, `user_id`, `week_id`, `pick_id null`, `kind enum(initial, wager, payout, refund, adjustment)`, `amount_cents int` (signed), `note` |
| `app_settings` | Site-wide config, single row. | `spread_lock_day int`, `spread_lock_time time`, `timezone text`, `default_starting_balance_cents`, `odds_provider`, `score_poll_interval_s` |
| `job_runs` | Observability for cron jobs. | `job_name`, `started_at`, `finished_at`, `status`, `detail jsonb` |

**Derived views**
- `league_balances` — `select league_id, user_id, sum(amount_cents)` from ledger. Materialized in Phase 1 only if measured slow (it will not be, at this size).
- `leaderboard` — balances joined to profiles with rank window function.

**RLS matrix (Phase 1)**

| Table | select | insert | update | delete |
|---|---|---|---|---|
| profiles | any authenticated user (display fields only) | own row (trigger on signup) | own row | — |
| seasons, weeks, teams, games, lines, app_settings(read subset) | authenticated | service role only | service role only | — |
| leagues | members of that league, or anyone with the invite code via a `join_league(code)` function | authenticated (creator becomes commissioner) | commissioner | commissioner while `status = open` and no picks |
| league_members | members of the same league | via `join_league()` function only | commissioner (role) | commissioner, or self (leave) |
| week_budgets | own rows + same-league members' rows | service role via `open_week()` | — | — |
| picks | own always; others' rows only where `game.kickoff_at <= now()` and same league | via `place_pick()` function only | via `place_pick()`/`delete_pick()` only, before kickoff | same |
| ledger | own rows; same-league members' rows | service role via settlement | — | — |
| storage `logos` | public read | path must start with `auth.uid()` | same | same |

Site-admin routes check `profiles.is_site_admin` **and** RLS policies also gate the admin-only tables, so a leaked anon key cannot elevate.

---

## 5. Core flows

**Weekly spread lock (cron: configured day/time)**
1. pg_cron fires `POST /api/jobs/lock-spreads` with a bearer secret.
2. Route fetches the week's games from ESPN (creates any missing `games` rows), fetches spreads from The Odds API, matches by team + kickoff.
3. Inserts a new `lines` row per game, flips `is_current`. Never edits an existing line.
4. Calls `open_week(week_id)`: for every league in the active season and every member, inserts `week_budgets` with their current balance.
5. Writes a `job_runs` row; revalidates the Next.js cache tag `spreads:{week}`.

**Placing a pick (server action → `place_pick(league, game, side, wager)`)**
- In one transaction with `select … for update` on the member's budget row: check membership, `game.kickoff_at > now()`, `game.status = scheduled`, `wager ≤ budget − Σ open wagers`, upsert the pick with the current `line_id`, write the `wager` ledger entry (or adjust if editing). Returns the new available amount. The UI updates optimistically and reverts on error.

**Score sync (cron: every minute; exits instantly if no game is live or within 30 min of kickoff)**
- Fetch ESPN scoreboard once (one request covers every game). Update `games` rows that changed. When a game turns `final`, call `settle_game(game_id)`: for every open pick on that game compute won/lost/push against the pick's *own* `line_id`, write payout/refund ledger rows, mark picks settled. Idempotent: re-running on a settled game is a no-op.
- Phase 2: also store `home_win_probability` from ESPN and compute cover probability (§7).

**Season end**
- Nightly job: if `now ≥ playoffs_start_at` and league is `open`, set `status = complete`, `winner_user_id = top of leaderboard`.

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
- **Cover probability (what a spread bettor actually cares about):** compute in-house. Model: remaining-margin ~ Normal(μ, σ) where μ = `(pregame_spread) × fraction_of_game_remaining` and σ = `13.5 × sqrt(fraction_of_game_remaining)` (13.5 ≈ historical std dev of NFL final margins). `P(cover) = P(current_margin + remaining_margin > −pick_spread)`. Pure function, unit-tested, ~20 lines. It is a well-known approximation (Stern 1991) and a good talking point in an interview; it can later be replaced by a logistic model trained on play-by-play if you want to go further.
- **Delivery:** Phase 2a polls every 30 s while a game the user has a pick in is live; Phase 2b switches to Supabase Realtime on `games` (free tier: 200 concurrent connections, 2M messages/month; a full Sunday for 20 users is ~50k messages).

---

## 8. Security

- **RLS on every table**, default deny, policies as in §4. A `pgTAP` test suite asserts each policy (e.g. "user A cannot read user B's unlocked pick").
- **All betting rules enforced in Postgres functions** (`security definer`, `search_path` pinned) so no client bug or crafted request can overspend or bet after kickoff.
- **Auth:** Supabase Auth with `@supabase/ssr` cookies. "Remember me" = persistent refresh-token cookie (default 30-day sliding, configurable); unchecked = session cookie. Refresh-token rotation and reuse detection are on by default.
- **Secrets:** service-role key and job secret live only in Vercel env vars and are only imported in `/api/jobs/*`, guarded by an ESLint rule (`no-restricted-imports` outside that folder). Anon key + URL are the only values shipped to the browser.
- **Admin surface** at `/admin` gated by `is_site_admin` in middleware and again in each server action.
- **Uploads:** MIME + magic-byte check, size cap, path scoped to `auth.uid()/`, no user-controlled filenames.
- **Rate limits:** Supabase Auth's built-in limits on sign-in; Vercel WAF basic rules. Invite codes are 8 chars from a 32-symbol alphabet (~1e12 space) and can be rotated by the commissioner.
- **Dependency hygiene:** Dependabot, `npm audit` in CI, lockfile committed.

---

## 9. Cost estimate

Verified against provider pricing pages on 2026-09-29. Free tiers change; re-check before the 2027 season.

| Service | Tier | What we use | Monthly cost |
|---|---|---|---|
| Vercel | Hobby | ~5k function invocations/week on game weeks, < 1 GB bandwidth | **$0** (non-commercial use is within the Hobby terms) |
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

### Phase 0 — Foundation (≈1 week)
Goal: an empty but production-shaped app deployed with CI, migrations, auth and RLS working end to end.
- Next.js 15 + TypeScript strict + Tailwind + shadcn/ui; ESLint, Prettier, Husky pre-commit.
- Supabase CLI: local stack via Docker, SQL migrations in `supabase/migrations/`, `supabase gen types` wired to `npm run db:types`.
- Migration 0001: `profiles`, `app_settings`, `job_runs`, RLS enabled, signup trigger.
- Auth pages: sign in / sign up / reset, remember-me checkbox, protected `/dashboard` shell.
- CI (GitHub Actions): lint, typecheck, unit tests, `supabase db reset` + pgTAP, Playwright smoke on preview URL.
- Deploy: Vercel project linked to `main`, preview deploys per PR, env vars documented in `.env.example`.
- `docs/adr/0001-stack.md` … capturing the decisions from §1.
- Weekly `pg_dump` backup workflow.

**Done when:** a new user can sign up on the deployed URL, close the browser, reopen a day later, and still be signed in; CI is green; RLS tests pass.

### Phase 1 — Season-ready MVP (≈3–4 weeks)
Goal: a league can run a full week without you touching the database.
1. **Reference data:** seasons, weeks, teams, games; `sync-schedule` job that imports the season schedule from ESPN; admin button to run it.
2. **Leagues:** create league, invite code, join by code, member list, commissioner settings (name, starting balance, rotate code, remove member).
3. **Spread lock job** + `open_week()` + admin settings for day/time/timezone/default balance, manual "re-pull now" and per-game re-pull.
4. **Picks UI:** mobile-first weekly sheet: each game shows both teams, spread, kickoff in local time, a tap-to-pick side, wager input with "available this week" always visible; edit/delete before kickoff; locked state after.
5. **Settlement:** `settle_game()` + hourly `sync-finals` job (Phase 1 only needs finals, not live). Ledger, balances, week_budgets.
6. **Dashboard:** leaderboard (rank, logo, name, balance, week delta), my picks this week with result badges, quick links to pick/view spreads.
7. **Profile:** display name, logo upload with client-side crop/resize.
8. **Admin panel:** settings form, job runs table with re-run buttons, season editor (`playoffs_start_at`), league list.
9. **Season end:** nightly job marks leagues complete and records the winner; dashboard shows a winner banner.
10. **Tests:** unit (payout math, budget math, spread matching), pgTAP (every RLS policy, `place_pick` rejections), Playwright (sign up → create league → join with second user → pick → simulate final → leaderboard updates).

**Done when:** two test users in two different leagues can play a simulated week end to end on the deployed site, and every table has RLS tests.

### Phase 2 — Live (≈2 weeks)
- Minute-level score sync during game windows; live status (quarter, clock, score) on dashboard picks.
- Cover-probability model + ESPN win probability shown per live pick.
- Client polling → Supabase Realtime.
- Pick history page and per-member stats (record ATS, ROI, biggest win).
- Email/push reminder "picks lock in 2 hours and you have $X unbet" (optional).

### Phase 3 — Polish and portfolio (≈1–2 weeks)
- PWA manifest + install prompt + offline shell.
- Multi-season support: archive view, all-time records.
- README with architecture diagram, screenshots, ADR index, "how a bet flows through the system" walkthrough for interviews.
- Lighthouse ≥ 90 on mobile; accessibility pass.

---

## 11. Repo layout (proposed)

```
pick-em/
├─ app/                      # Next.js App Router
│  ├─ (auth)/ sign-in, sign-up, reset
│  ├─ (app)/ dashboard, leagues/[id]/picks, leagues/[id]/spreads, profile
│  ├─ admin/
│  └─ api/jobs/ lock-spreads, sync-scores, sync-schedule, close-season
├─ components/               # UI (shadcn) + feature components
├─ lib/
│  ├─ supabase/ (server, client, middleware helpers)
│  ├─ providers/ (espn.ts, odds-api.ts, ScoreProvider/OddsProvider interfaces)
│  ├─ domain/ (payout.ts, budget.ts, cover-probability.ts — pure, unit-tested)
│  └─ cache.ts (tags, revalidate helpers)
├─ supabase/
│  ├─ migrations/            # SQL, one file per change
│  ├─ tests/                 # pgTAP
│  └─ seed.sql               # teams, a demo season
├─ tests/ e2e/ (Playwright)
├─ docs/ PLAN.md, adr/
└─ .github/workflows/ ci.yml, backup.yml
```

---

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| ESPN API changes or blocks | Live scores stop | Provider interface; The Odds API scores fallback; dashboard degrades to "scores delayed" |
| Free-tier project pause in off-season | Site down until restored | Documented one-click restore; optional Pro upgrade |
| Spread matching errors (team name mismatch, doubleheaders) | Wrong line locked | Match on ESPN event id where possible, team abbreviation + kickoff window otherwise; admin per-game re-pull; job logs the unmatched list |
| Double-submit / race on wager | Overspend | Row lock inside `place_pick`; unique pick per game |
| Time zones | Picks lock at wrong time | Store UTC only; test around DST change (first Sunday in November is a game day) |
| Scope creep before the season | Nothing ships | Phase 1 list is frozen once you sign off on §1 |
| Sunday 1:00 PM thundering herd at larger scale | Slow dashboard | Tag-based cache means viewers do not hit the DB; load-test the dashboard with k6 against a preview deploy in Phase 3 |

---

## 13. Next step

Answer §1 (even just "all defaults except 1b, 11a"). I will then:
1. Fold the answers into §2 and write `docs/adr/0001-stack.md`.
2. Start Phase 0 on a `phase-0/foundation` branch with one PR per bullet.
