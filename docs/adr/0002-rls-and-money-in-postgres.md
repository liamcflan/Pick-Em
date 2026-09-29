# ADR 0002: RLS as the authorization layer; betting rules in Postgres functions

Date: 2026-09-29 · Status: Accepted

## Context

Members of different leagues must never see or change each other's data, and no client bug or
crafted request may let a member bet more than their weekly budget or after kickoff.

## Decision

- Every table has RLS enabled with default-deny. Policies are written `to authenticated`; `anon`
  holds no privileges on application tables.
- Table privileges are tightened explicitly (`revoke all … grant select/update (columns)`), so RLS
  decides *which rows* and grants decide *which columns*. Example: users may update their own
  `display_name` but the `is_site_admin` column is not grantable to them at all.
- Money-moving operations (`place_pick`, `settle_game`, `open_week`, `join_league`) are
  `security definer` SQL functions with a pinned `search_path`. They run in one transaction with row
  locks, so double-submits cannot overspend. The app never inserts into `picks` or `ledger` directly.
- Every policy has a pgTAP test that asserts both the allowed and the denied case.

## Consequences

- Business rules live next to the data, in SQL, and are tested with pgTAP rather than only in JS.
- The app can be reasoned about as "what can this JWT do", which is what a security review asks.
