# ADR 0003: Structured JSON logs and an append-only audit table

Date: 2026-09-29 · Status: Accepted

## Context

When a member says "I picked the Chiefs and it shows the Raiders", we need to answer from data,
not memory. Jobs run unattended on a schedule and must be debuggable after the fact.

## Decision

- **Logs are one JSON object per line** on stdout from both runtimes (`src/lib/log.ts`,
  `pickem/log.py`), with the same field names (`ts`, `level`, `msg`, `request_id`, `job`). Vercel
  captures stdout; a log drain can be attached later without code changes. Never log secrets,
  tokens or email addresses.
- **Every job invocation carries a request id** (`X-Request-Id` header, or generated) that appears
  in its logs, its JSON response and its `job_runs` row.
- **`audit_log` is an append-only table** populated only by the `audit_row()` trigger. It records
  table, row id, action, actor (`auth.uid()`), actor role, request id, and the full before/after
  row as JSON. Update and delete on it are blocked by trigger for every role.
- Attached in Phase 0 to `profiles` and `app_settings`; in Phase 1 to `picks`, `league_members`
  and `leagues`. Members can read audit rows for their own actions; site admins can read all.

## Consequences

- Disputes about picks are resolved by reading `audit_log` for that pick's row id.
- Storage grows with edits, not with reads; at this scale it is negligible.
