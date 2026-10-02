# Design brief: 10K Pool HQ

Paste everything below the line into a design tool (Claude, v0, Figma Make, Lovable, etc.).
It describes the product, the rules that shape the UI, every screen and its states, and the
constraints that let the result drop into the existing code.

---

You are designing the UI and UX for **10K Pool HQ** (10kpoolhq.com), a mobile-first web app for
a private NFL spread pick'em pool among friends. Produce a cohesive visual design system and
high-fidelity screens for phone (390 px wide) and desktop (1280 px wide), in light and dark mode.

## The game (rules the UI must make obvious)

- Each league is a group of friends. Every player starts the season with **$10,000** (play money).
- Each week players bet on NFL games **against the spread**, in whole **$1,000 units** (1k, 2k, …).
  One pick per game: choose a side and a wager.
- Spreads lock Wednesday morning (from the New York Post; a commissioner can correct a line).
- **Deadline:** 11:59 PM Eastern the night before each game's kickoff. After that the game is locked.
- Players must bet at least $1,000 each week and can only bet what they had when the week opened
  (winnings pay out when the week settles, not mid-week).
- Even-money payouts. A **push (tie against the spread) is a loss**. A cancelled game refunds.
- One **bye week** per season, usable in weeks 1–13. Miss the deadline with no bet: the bye is
  used automatically, or if it is gone, $1,000 is forced onto the underdog of the week's last game.
- Hit $0 and you are **busted** (eliminated). Last player with money wins; otherwise most money at
  the end of the regular season (week 18) wins.

## Who uses it

- **Players** (20–30 friends, mostly on phones, often on Sunday during games): check balance and
  rank, place and edit picks before deadlines, follow live scores, trash-talk via the news feed.
- **Commissioners** (one or more per league): invite people, edit league settings, promote other
  commissioners, remove members.
- **Site admin** (the owner): import the schedule, fix lines, run settlement, manage users.

## Brand and tone

- Name: **10K Pool HQ**. Current icon: a white football on a turf-green tile (#166534).
- Feel: a sharp sports-betting app crossed with a friendly group chat. Confident, fast, a little
  playful; never casino-like or predatory (it is play money among friends).
- Money is the hero number everywhere: big, tabular figures, clear green/red for up/down.
- Must stay readable outdoors and at a glance mid-game.

## Screens to design (with states)

1. **Landing (signed out):** name, one-line pitch, Sign in / Create account.
2. **Auth:** sign in (email + password, Continue with Google, "Remember me on this device"),
   sign up (display name, email, password), forgot password, choose new password. Inline errors.
3. **Dashboard (home after sign-in):**
   - My leagues: league name, my rank ("3rd of 12"), my balance, change this week.
   - This week across my leagues: each pick (team, spread, wager, kickoff/deadline), live score
     and **chance to cover** during games, result badge after (Won / Lost / Push = loss / Void).
     Status per league: picked, bye taken, nothing in yet (urgent), eliminated, league complete.
   - News feed across leagues (joins, spreads locked, week settled, eliminations, commissioner notes).
   - Install-app hint on phones only (floating card, dismissible).
4. **Leagues:** create a league (name), join by invite code (format ABCD-EFGH), list of my leagues.
5. **League page:** leaderboard (rank, avatar/logo, name, balance, this-week movement, busted
   badge, commissioner badge), winner banner when complete, news feed, invite code + copy button
   and settings for commissioners (name, starting balance, rotate code, roles, remove member).
6. **Picks sheet (the most important screen, mostly used on phones):**
   - Week switcher; "Available this week: $X of $Y" always visible (sticky).
   - One row per game: away @ home with team logos, spread (e.g. NYG −3.5), kickoff in local
     time, deadline countdown; two large side buttons; a wager stepper in $1,000 steps; save,
     edit, remove. Locked state after the deadline. Live state with score, quarter/clock and
     cover probability. Final state with the result badge and payout.
   - Bye card (weeks 1–13, once a season) and the "you have nothing in yet" warning.
   - Over-budget, below-minimum and past-deadline errors.
7. **Pick history / player stats:** record against the spread (W-L), net, ROI, biggest win,
   forced picks, and every pick with its result; switch between league members.
8. **Profile:** display name, logo upload with crop preview (256 px), change password, picks-due
   email reminders on/off.
9. **Admin (desktop-first is fine):** overview with job runs and buttons (sync schedule, lock
   lines, settle), lines editor per week, leagues list (archive/restore), **users** (search,
   email, last sign-in, make/remove site admin, make commissioner/member per league), site
   settings (lock day/time, timezone, default balance, bet unit), audit log viewer, season editor.
10. **System pages:** status page (deployment + setup checks), offline page, error page, 404.

## Components to define

Buttons (primary, secondary, ghost, destructive, icon), inputs, segmented side picker, wager
stepper, cards, leaderboard row, pick row (open / saved / locked / live / final), result badges,
balance and delta chips, countdown, news-feed item, avatar with fallback initials, toast,
confirmation dialog, empty states, skeleton loaders, tabs/week switcher, header with nav and
profile menu, bottom navigation for phones (Home, Picks, League, Profile), banners (offline,
deadline soon, winner).

## Constraints (so the design maps to the code)

- Built with Next.js, **Tailwind CSS v4** and **shadcn/ui**-style components (Radix primitives).
  Express the system as shadcn theme tokens: `--background`, `--foreground`, `--card`,
  `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`,
  `--ring`, `--radius`, plus success/warning tokens for money up/down, in **OKLCH**, for light
  and dark.
- Fonts: currently Geist / Geist Mono; suggest alternatives if they serve the sports feel better.
  Numbers must use tabular figures.
- Accessibility is required: WCAG 2.1 AA contrast, 44 px touch targets, visible focus rings, never
  colour alone for won/lost (pair with text or icon), works with screen readers and reduced motion.
- Fast on mid-range phones: no heavy imagery or video; team logos are small images.
- It is an installable app (opens full screen from the home screen), so design for safe areas
  and a standalone app feel.

## Deliverables

1. Design tokens (light and dark) as CSS variables in the shadcn format above.
2. Type scale, spacing, radius and elevation rules.
3. Component sheet with every state listed above.
4. High-fidelity screens for every screen above, phone and desktop, light and dark, including
   empty, loading, error, live-game and end-of-season states.
5. Short interaction notes: placing a pick in two taps, editing before the deadline, what
   happens at the deadline, live updates, and celebrating a won week or a league win.
