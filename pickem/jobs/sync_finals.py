"""Refresh scores for weeks in play and settle the ones that have finished (docs/RULES.md #10-12).

POST /api/jobs/sync_finals  {}

Runs hourly from pg_cron. Idempotent and cheap:

* looks at the active season's weeks that have kicked off but are not settled,
* re-fetches those weeks from ESPN (scores + status; same upsert as sync_schedule),
* calls `settle_week` for each: finished games are graded straight away, and once every game is
  final or void the week settles (eliminations, last-one-standing, season-end winner).

All money movement happens inside the database function; this job only decides *when* to call it.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from typing import Any, Protocol

from pickem.jobs.sync_schedule import ScheduleStore, sync_schedule
from pickem.log import get_logger
from pickem.providers.espn import fetch_scoreboard
from pickem.vercel import JobRequest, JobResponse

log = get_logger("pickem.jobs.sync_finals")


class FinalsStore(ScheduleStore, Protocol):
    def active_season(self) -> Mapping[str, Any] | None: ...
    def started_unsettled_weeks(self, season_id: str, now: datetime) -> list[Mapping[str, Any]]: ...
    def settle_week(self, week_id: str) -> Mapping[str, Any]: ...


Fetcher = Callable[[int, int], Mapping[str, Any]]


def sync_finals(
    store: FinalsStore, *, fetch: Fetcher = fetch_scoreboard, now: datetime | None = None
) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    season = store.active_season()
    if season is None:
        return {"skipped": "no active season"}
    weeks = store.started_unsettled_weeks(season["id"], now)
    if not weeks:
        return {"skipped": "no weeks in play", "year": season["year"]}

    numbers = [int(w["week_number"]) for w in weeks]
    synced = sync_schedule(store, year=int(season["year"]), weeks=numbers, fetch=fetch, now=now)

    results: list[dict[str, Any]] = []
    settled = 0
    for w in weeks:
        outcome = dict(store.settle_week(w["id"]))
        outcome.setdefault("week", w["week_number"])
        results.append(outcome)
        if outcome.get("ready"):
            settled += 1
        log.info("week checked", extra={k: v for k, v in outcome.items() if k != "errors"})

    return {
        "year": season["year"],
        "weeks": numbers,
        "games_synced": synced.get("games", 0),
        "fetch_errors": synced.get("errors", []),
        "weeks_settled": settled,
        "results": results,
    }


def run(request: JobRequest) -> JobResponse:
    from pickem.store import SupabaseSettlementStore

    store = SupabaseSettlementStore.from_settings(request.settings)
    run_id = store.start_run("sync_finals", request.request_id)
    try:
        summary = sync_finals(store)
    except Exception as exc:
        store.finish_run(run_id, "failed", {"error": str(exc)})
        raise
    store.finish_run(run_id, "succeeded", summary)
    return JobResponse(200, {"ok": True, **summary})
