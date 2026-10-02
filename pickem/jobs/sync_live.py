"""Minute-level score sync while games are in play (Phase 2).

POST /api/jobs/sync_live  {}

Scheduled every two minutes by pg_cron. It costs one cheap query when nothing is live and
returns immediately; otherwise it does exactly what `sync_finals` does, restricted to the weeks
that have a game in progress (or about to kick off): refresh scores/clock/status from ESPN and
call `settle_week`, which grades games the moment they go final. Browsers subscribed to the
`games` table through Supabase Realtime pick the changes up without polling.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from typing import Any, Protocol

from pickem.jobs.sync_finals import FinalsStore
from pickem.jobs.sync_schedule import sync_schedule
from pickem.log import get_logger
from pickem.providers.espn import fetch_scoreboard
from pickem.vercel import JobRequest, JobResponse

log = get_logger("pickem.jobs.sync_live")


class LiveStore(FinalsStore, Protocol):
    def live_weeks(self, season_id: str, now: datetime) -> list[Mapping[str, Any]]: ...


Fetcher = Callable[[int, int], Mapping[str, Any]]


def sync_live(
    store: LiveStore, *, fetch: Fetcher = fetch_scoreboard, now: datetime | None = None
) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    season = store.active_season()
    if season is None:
        return {"skipped": "no active season"}
    weeks = store.live_weeks(season["id"], now)
    if not weeks:
        return {"skipped": "no games in play", "year": season["year"]}

    numbers = [int(w["week_number"]) for w in weeks]
    synced = sync_schedule(store, year=int(season["year"]), weeks=numbers, fetch=fetch, now=now)
    results = []
    for w in weeks:
        outcome = dict(store.settle_week(w["id"]))
        outcome.setdefault("week", w["week_number"])
        results.append(outcome)
    log.info("live sync", extra={"weeks": numbers, "games": synced.get("games", 0)})
    return {
        "year": season["year"],
        "weeks": numbers,
        "games_synced": synced.get("games", 0),
        "fetch_errors": synced.get("errors", []),
        "results": results,
    }


def run(request: JobRequest) -> JobResponse:
    from pickem.store import SupabaseSettlementStore

    store = SupabaseSettlementStore.from_settings(request.settings)
    run_id = store.start_run("sync_live", request.request_id)
    try:
        summary = sync_live(store)
    except Exception as exc:
        store.finish_run(run_id, "failed", {"error": str(exc)})
        raise
    store.finish_run(run_id, "succeeded", summary)
    return JobResponse(200, {"ok": True, **summary})
