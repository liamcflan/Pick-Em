# Web app (Next.js)

The user-facing app: Next.js 16 App Router, React Server Components, Server Actions, TypeScript
strict, Tailwind v4 with hand-written shadcn-style primitives. Deployed on Vercel.

> Next.js 16 differs from older versions (`proxy.ts` instead of `middleware.ts`, generated
> `PageProps`/`LayoutProps` via `next typegen`, a React purity lint rule). See `AGENTS.md` and
> `node_modules/next/dist/docs/` before writing new code.

## Routes

| Route                       | Who          | What                                                                                  |
| --------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| `/`                         | anyone       | Landing page                                                                          |
| `/sign-in`, `/sign-up`, `/forgot-password`, `/update-password` | anyone | Email/password + Google; "remember me" controls cookie persistence |
| `/auth/callback`            | anyone       | OAuth / magic-link code exchange, then a same-origin redirect (`safeNext`)            |
| `/dashboard`                | member       | My leagues with rank and balance, this week's picks per league with results, news across leagues |
| `/leagues`                  | member       | Create a league / join by invite code                                                 |
| `/leagues/[id]`             | member       | Leaderboard (avatars, this-week movement, busted badge), news feed, invite code and settings for commissioners, winner banner |
| `/leagues/[id]/picks?week=` | member       | The weekly picks sheet: budget, bye card, one row per game with side buttons and a wager stepper, result badges once settled |
| `/leagues/[id]/history?user=` | member     | A member's record against the spread, net, ROI, biggest win, and every pick with its result |
| `/profile`                  | member       | Display name; logo upload (browser crop to 256 px WebP)                              |
| `/admin`                    | site admin   | Schedule import, settlement buttons, recent job runs, season editor and week table     |
| `/admin/lines?week=`        | site admin   | Pull consensus lines now, edit any line, void a game                                  |
| `/admin/leagues`            | site admin   | Every league with status, player counts, creator and invite code; archive / restore   |
| `/admin/settings`           | site admin   | Lock day/time, timezone, default balance, bet unit, pick hiding                       |
| `/admin/audit`              | site admin   | Audit log viewer with filters                                                         |
| `/api/revalidate`           | jobs         | Cache-tag invalidation, `x-job-secret` protected                                      |

`/admin/*` returns 404 (not 403) for non-admins so the section's existence is not advertised.

## Installable app (PWA)

Phones can add Pick-Em to the home screen and open it full screen.

| Piece                                   | What it does                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/app/manifest.ts`                   | Serves `/manifest.webmanifest`: name, icons, `start_url: /dashboard`, standalone display.     |
| `public/icons/`                         | 192/512 icons, a maskable 512 (artwork inside Android's 80% safe zone) and the Apple icon.    |
| `public/sw.js`                          | Service worker. Network-only; on a failed page load it serves the precached `/offline.html`. |
| `components/pwa/register-service-worker` | Registers the worker in production builds only, so dev hot reload is unaffected.            |
| `components/pwa/offline-banner`         | Banner on every page while `navigator.onLine` is false.                                      |
| `components/pwa/install-hint`           | Dashboard card: an Install button where the browser offers one, Share → Add to Home Screen steps on iPhone; "Not now" is remembered in `localStorage`. |
| `app/(app)/error.tsx`                   | Error boundary for signed-in pages; says "You're offline" when that is the cause, with a retry. |

The worker never caches pages, API responses or Supabase calls: balances and scores must always be
live, and caching a signed-in page would also keep one user's data on a shared device. Bump
`VERSION` in `sw.js` when the offline page or its icon changes. `/sw.js` is served with
`Cache-Control: no-store` (see `next.config.ts`) so fixes reach installed apps on the next visit.
The CSP lists `worker-src 'self'` and `manifest-src 'self'` explicitly.

To change the icon, edit `scripts/icons/icon.mjs`, then run
`node scripts/icons/render.mjs` (set `PLAYWRIGHT_CHROMIUM_PATH` if Playwright's browser is not
downloaded).

## Auth and sessions

- `src/lib/supabase/server.ts` creates a request-scoped client that reads/writes the Supabase
  auth cookies through `@supabase/ssr`. `getUser()` validates the JWT with the auth server.
- `src/proxy.ts` refreshes the session on every request and applies the security headers from
  `src/lib/security/headers.ts` (nonce-based CSP with `'strict-dynamic'`, HSTS in production,
  `X-Frame-Options: DENY`, etc.).
- **Remember me:** a `pickem_remember` cookie records the choice; `applyPersistence()` strips
  `Max-Age`/`Expires` from the auth cookies when it is off, so they die with the browser
  (`src/lib/supabase/remember.ts`, unit-tested).
- Google sign-in goes through Supabase OAuth; the callback route exchanges the code and redirects
  only to same-origin paths.

## Data access

- Server components query PostgREST through the typed client (`Database` in
  `src/lib/supabase/database.types.ts`, hand-maintained to mirror the migrations). RLS decides
  what comes back, so pages never filter "for security", only for display.
- Writes go through Server Actions (`actions.ts` beside each route). Pattern:

  ```ts
  export async function placePick(_prev: PickActionState, formData: FormData) {
    const user = await getUser();                       // 1. who
    const parsed = schema.safeParse({...formData});     // 2. Zod
    const { error } = await supabase.rpc("place_pick", {...}); // 3. a Postgres function
    if (error) return { error: friendlyDbError(error) }; // 4. friendly message
    revalidatePath(`/leagues/${leagueId}/picks`);       // 5. refresh
    return { success: "Bet placed." };
  }
  ```

- `useActionState` on the client renders `FormMessage` (`role="alert"` / `role="status"`) so
  Playwright and screen readers both see outcomes.

## Domain logic (`src/lib/domain/`)

Pure, unit-tested modules with no React or env dependency: `money` (cents ⇄ dollars, bet unit),
`spread` (side spread, formatting), `invite-code` (normalise/format), `events` (news-feed
sentences), `leaderboard` (ranking with tie-breaks), `avatar` (paths, URLs, initials), `audit`
(field diffs for the viewer), `probability` (in-game chance to cover), `live` (is anything in play).

## Components

- `components/ui/` – Button, Card, Input, Label (shadcn-style, Radix where needed).
- `components/auth/` – SubmitButton (pending text), FormMessage, GoogleButton.
- `components/leagues/` – create/join forms, Leaderboard, NewsFeed, InviteCodeCard, settings forms.
- `components/picks/` – PickRow (side buttons, stepper, result badge), ByeCard, ThisWeek.
- `components/admin/` – schedule import, line editor + void button, settlement buttons, settings.
- `components/profile/` – Avatar, ProfileForm, LogoUploader (client-side canvas resize, direct
  upload to Storage, then a server action to record the path).
- `components/pwa/` – service-worker registration, offline banner, install hint (see above).

Client components are limited to what needs interactivity; everything else is a server component.

## Environment

| Variable                              | Where             | Purpose                                              |
| ------------------------------------- | ----------------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`            | browser + server  | Supabase project URL                                 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`| browser + server  | Anon/publishable key (safe to ship; RLS applies)     |
| `NEXT_PUBLIC_APP_URL`                 | server            | Canonical origin for redirects and job calls         |
| `JOB_SECRET`                          | server only       | Lets admin buttons call the Python jobs              |

`src/lib/env.ts` validates them with Zod at startup; the service-role key is deliberately absent.

## Conventions

- `pnpm check` must pass before pushing (lint, Prettier, `next typegen && tsc`, Vitest, Ruff,
  pytest).
- Time-dependent values (`Date.now()`) belong in a `load…Data()` helper, not in a component body.
- Money is formatted with `formatMoney(cents)`; never do arithmetic in dollars.
- Accessible names on every interactive element (`aria-label` on icon buttons, `aria-pressed` on
  toggles) — the e2e tests rely on them.
