#!/usr/bin/env bash
# Apply migrations and run pgTAP tests against a throwaway database on a local Postgres.
# Used when Docker is unavailable. CI runs `supabase test db` instead.
#
#   DATABASE_ADMIN_URL=postgresql://user:pass@localhost:5432/postgres pnpm db:test:local
set -euo pipefail

ADMIN_URL="${DATABASE_ADMIN_URL:-postgresql://postgres@localhost:5432/postgres}"
DB="pickem_test_$$"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

cleanup() { psql "$ADMIN_URL" -q -c "drop database if exists $DB" >/dev/null; }
trap cleanup EXIT

psql "$ADMIN_URL" -q -c "create database $DB"
TEST_URL="${ADMIN_URL%/*}/$DB"

psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/db/local-shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "applying $(basename "$f")"
  psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f "$f"
done

pg_prove --ext .sql -d "$TEST_URL" "$ROOT"/supabase/tests/*.sql
