# Security

This document is the contract every change must honour. It is short on purpose; read it before
touching auth, the database, uploads, or the jobs.

## Reporting a vulnerability

Open a private security advisory on GitHub (Security → Advisories → Report a vulnerability) or
email the repository owner. Please do not open a public issue for security problems.

## Secrets

- Secrets live only in environment variables: `.env.local` for development (gitignored), Vercel
  project settings for deployments, GitHub Actions secrets for CI. `.env.example` holds
  placeholders only.
- The **Supabase service-role key bypasses RLS**. It is read only by the Python jobs. An ESLint
  rule fails the build if any file under `src/` references it.
- `JOB_SECRET` (≥ 32 random bytes, `openssl rand -hex 32`) is the only credential the job endpoints
  and `/api/revalidate` accept. It is compared in constant time.
- CI runs [gitleaks](https://github.com/gitleaks/gitleaks) over the full history on every push and
  fails if anything that looks like a credential is committed. Turn on GitHub's own secret scanning
  and push protection in the repository settings as a second net.

## Authorization: RLS is the boundary

- The web app talks to Postgres **as the signed-in user** (anon key + user JWT). Every table has
  row-level security enabled with default-deny, and `anon` holds no privileges on application
  tables.
- Table privileges are granted per column, so RLS decides *which rows* and grants decide *which
  columns*. A user can rename themself; they cannot touch `is_site_admin`.
- Anything that moves money (`place_pick`, `settle_game`, `open_week`, `join_league`) is a
  `security definer` Postgres function with a pinned `search_path`, running in one transaction with
  row locks. The app never inserts into `picks` or `ledger` directly.
- Every policy has a pgTAP test for both the allowed and the denied case. A new table without
  RLS tests does not merge.

## Injection

- **SQL:** application code never builds SQL from strings. TypeScript uses `supabase-js`
  (PostgREST, parameterised) and Python uses `supabase-py`. Ruff's bandit rules (`S608`) flag
  string-built SQL in Python; migrations are static files reviewed in PRs. If raw SQL is ever
  needed, it goes in a migration or a parameterised Postgres function, never interpolated.
- **Input validation:** every form, server action and route handler parses its input with Zod
  (TypeScript) or explicit checks (Python) before use. Unknown fields are dropped.
- **Redirects:** post-auth `next` targets are restricted to same-origin relative paths
  (`safeNext`), which blocks open redirects.
- **Uploads (Phase 1):** MIME and magic-byte checks, size caps, server-generated file names, paths
  scoped to the uploader's user id, client-side resize to a fixed size.

## Browser hardening

- A per-request **Content Security Policy** with a script nonce and `'strict-dynamic'`: only
  scripts the server rendered may execute, so injected `<script>` tags are inert. Plus
  `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, restricted `form-action` and
  `connect-src`.
- `Strict-Transport-Security` (production), `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive
  `Permissions-Policy`, and `X-Powered-By` removed.
- Auth cookies are `SameSite=Lax`, `Secure` in production, and become session cookies when
  "remember me" is unchecked.
- Next.js Server Actions carry built-in CSRF protection (Origin/Host check on every POST).

## Rate limiting and abuse

- Supabase Auth rate-limits sign-in, sign-up and password-reset requests per IP and per email.
- Password reset always returns the same message, so the form cannot be used to enumerate emails.
- Invite codes are 8 characters from a 32-symbol alphabet (about 10^12 possibilities) and can be
  rotated by a commissioner.

## Supply chain

- Lockfiles (`pnpm-lock.yaml`, `uv.lock`) are committed and installs are `--frozen`.
- CI fails on high-severity advisories (`pnpm audit`, `pip-audit`) and Dependabot opens grouped
  weekly update PRs for npm, Python and GitHub Actions.
- CodeQL runs on every push and weekly for both languages.

## Auditability

- Both runtimes log one JSON object per line with a shared `request_id`; never secrets, tokens or
  email addresses.
- `audit_log` is append-only (update/delete blocked by trigger for every role) and records actor,
  role, request id and full before/after rows for sensitive tables.
