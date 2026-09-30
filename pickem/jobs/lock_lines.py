"""Lock the week's spreads (docs/RULES.md #3).

POST /api/jobs/lock_lines  {"week": 5, "force": false}   (both optional)

Runs from pg_cron a few times on Wednesday mornings (see supabase/cron/schedule.sql). It is
idempotent and safe to run any time:

* picks the target week (explicit, or the active season's current week),
* does nothing until that week's `spread_lock_at` has passed (unless forced),
* fetches ESPN's scoreboard and writes one `api` line per game that has no current line,
* never overwrites an `admin` line (a site admin matched the New York Post by hand) unless forced,
* posts one `spreads_locked` event per league the first time the week gets lines.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from typing import Any, Protocol

from pickem.log import get_logger
from pickem.providers.espn import fetch_scoreboard, parse_scoreboard
from pickem.vercel import JobRequest, JobResponse

log = get_logger("pickem.jobs.lock_lines")


class LineStore(Protocol):
    def active_season(self) -> Mapping[str, Any] | None: ...
    def week(self, season_id: str, week_number: int | None) -> Mapping[str, Any] | None: ...
    def games_with_current_lines(self, week_id: str) -> list[Mapping[str, Any]]: ...
    def set_api_line(self, game_id: str, home_spread: float) -> None: ...
    def league_ids_for_season(self, season_id: str) -> list[str]: ...
    def post_event(self, league_id: str, kind: str, payload: Mapping[str, Any]) -> None: ...
    def start_run(self, job_name: str, request_id: str) -> str: ...
    def finish_run(self, run_id: str, status: str, detail: Mapping[str, Any]) -> None: ...


Fetcher = Callable[[int, int], Mapping[str, Any]]


def _parse_ts(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def lock_lines(
    store: LineStore,
    *,
    week_number: int | None = None,
    force: bool = False,
    fetch: Fetcher = fetch_scoreboard,
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    season = store.active_season()
    if season is None:
        return {"skipped": "no active season"}
    week = store.week(season["id"], week_number)
    if week is None:
        return {"skipped": "no current week"}

    lock_at = _parse_ts(week.get("spread_lock_at"))
    summary: dict[str, Any] = {
        "year": season["year"],
        "week": week["week_number"],
        "locked": 0,
        "skipped_existing": 0,
        "missing_spread": [],
        "events": 0,
    }
    if not force and (lock_at is None or now < lock_at):
        summary["skipped"] = "before spread_lock_at"
        log.info(
            "not yet time to lock", extra={"week": week["week_number"], "lock_at": str(lock_at)}
        )
        return summary

    games = store.games_with_current_lines(week["id"])
    had_lines_before = any(g.get("current_line_source") for g in games)

    payload = fetch(int(season["year"]), int(week["week_number"]))
    spreads = {g.espn_event_id: g.home_spread for g in parse_scoreboard(payload)}

    for g in games:
        if g.get("status") in ("final", "void"):
            continue
        if g.get("current_line_source") and not force:
            summary["skipped_existing"] += 1
            continue
        if g.get("current_line_source") == "admin" and not force:
            summary["skipped_existing"] += 1
            continue
        spread = spreads.get(str(g["espn_event_id"]))
        if spread is None:
            summary["missing_spread"].append(g["espn_event_id"])
            continue
        store.set_api_line(g["id"], float(spread))
        summary["locked"] += 1

    if summary["locked"] and not had_lines_before:
        for league_id in store.league_ids_for_season(season["id"]):
            store.post_event(league_id, "spreads_locked", {"week": week["week_number"]})
            summary["events"] += 1

    log.info("lines locked", extra={k: v for k, v in summary.items() if k != "missing_spread"})
    return summary


def run(request: JobRequest) -> JobResponse:
    from pickem.store import SupabaseLineStore

    body = request.json() or {}
    week = body.get("week")
    if week is not None and not (isinstance(week, int) and 1 <= week <= 22):
        return JobResponse(400, {"error": "week must be an integer 1-22"})
    force = bool(body.get("force", False))

    store = SupabaseLineStore.from_settings(request.settings)
    run_id = store.start_run("lock_lines", request.request_id)
    try:
        summary = lock_lines(store, week_number=week, force=force)
    except Exception as exc:
        store.finish_run(run_id, "failed", {"error": str(exc)})
        raise
    store.finish_run(run_id, "succeeded", summary)
    return JobResponse(200, {"ok": True, **summary})
