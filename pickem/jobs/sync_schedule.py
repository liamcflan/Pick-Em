"""Import (or refresh) the NFL schedule for a season from ESPN.

POST /api/jobs/sync_schedule  {"year": 2026, "weeks": [5, 6]}   (both optional)

Idempotent: games are upserted on espn_event_id, weeks on (season, week_number). Scores and
status are refreshed too, so this doubles as a coarse "sync finals" until the live job exists.
Persistence goes through the `ScheduleStore` protocol so the job logic is testable with a fake.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import UTC, datetime, time
from typing import Any, Protocol

from pickem.log import get_logger
from pickem.providers.espn import ScoreboardGame, fetch_scoreboard, parse_scoreboard
from pickem.schedule import week_window
from pickem.vercel import JobRequest, JobResponse

log = get_logger("pickem.jobs.sync_schedule")

DEFAULT_WEEKS = range(1, 19)


class ScheduleStore(Protocol):
    def settings(self) -> Mapping[str, Any]: ...
    def get_or_create_season(self, year: int) -> str: ...
    def team_ids_by_espn_id(self) -> dict[int, str]: ...
    def upsert_week(
        self, season_id: str, week_number: int, opens_at: datetime, lock_at: datetime
    ) -> str: ...
    def upsert_games(self, rows: list[dict[str, Any]]) -> int: ...
    def start_run(self, job_name: str, request_id: str) -> str: ...
    def finish_run(self, run_id: str, status: str, detail: Mapping[str, Any]) -> None: ...


class SeasonActivator(Protocol):
    def activate_if_none(self, season_id: str) -> bool: ...


Fetcher = Callable[[int, int], Mapping[str, Any]]


def game_row(
    g: ScoreboardGame, *, season_id: str, week_id: str, team_ids: Mapping[int, str], now: datetime
) -> dict[str, Any] | None:
    home = team_ids.get(g.home_espn_team_id)
    away = team_ids.get(g.away_espn_team_id)
    if home is None or away is None:
        return None
    return {
        "espn_event_id": g.espn_event_id,
        "season_id": season_id,
        "week_id": week_id,
        "home_team_id": home,
        "away_team_id": away,
        "kickoff_at": g.kickoff_at.isoformat(),
        "neutral_site": g.neutral_site,
        "status": g.status,
        "status_detail": g.status_detail,
        "home_score": g.home_score,
        "away_score": g.away_score,
        "period": g.period,
        "clock": g.clock,
        "last_synced_at": now.isoformat(),
    }


def sync_schedule(
    store: ScheduleStore,
    *,
    year: int,
    weeks: list[int] | None = None,
    fetch: Fetcher = fetch_scoreboard,
    now: datetime | None = None,
    activator: SeasonActivator | None = None,
) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    settings = store.settings()
    tz = str(settings.get("timezone", "America/New_York"))
    lock_day = int(settings.get("spread_lock_day", 3))
    raw_time = settings.get("spread_lock_time", "08:00")
    lock_time = time.fromisoformat(str(raw_time)[:8]) if isinstance(raw_time, str) else raw_time

    season_id = store.get_or_create_season(year)
    team_ids = store.team_ids_by_espn_id()

    summary: dict[str, Any] = {
        "year": year,
        "weeks": 0,
        "games": 0,
        "unmatched": [],
        "errors": [],
        "activated": False,
    }
    for week_number in weeks or list(DEFAULT_WEEKS):
        try:
            payload = fetch(year, week_number)
        except (
            Exception
        ) as exc:  # network / provider errors are reported, not fatal for other weeks
            log.warning("scoreboard fetch failed", extra={"week": week_number, "error": str(exc)})
            summary["errors"].append({"week": week_number, "error": str(exc)})
            continue
        games = [
            g
            for g in parse_scoreboard(payload)
            if g.season_year == year and g.week_number == week_number
        ]
        if not games:
            log.info("no games for week", extra={"week": week_number})
            continue
        first_kickoff = min(g.kickoff_at for g in games)
        opens_at, lock_at = week_window(
            first_kickoff, timezone=tz, lock_day=lock_day, lock_time=lock_time
        )
        week_id = store.upsert_week(season_id, week_number, opens_at, lock_at)

        rows: list[dict[str, Any]] = []
        for g in games:
            row = game_row(g, season_id=season_id, week_id=week_id, team_ids=team_ids, now=now)
            if row is None:
                summary["unmatched"].append(
                    {
                        "event": g.espn_event_id,
                        "home": g.home_espn_team_id,
                        "away": g.away_espn_team_id,
                    }
                )
                continue
            rows.append(row)
        summary["games"] += store.upsert_games(rows)
        summary["weeks"] += 1
        log.info("week synced", extra={"week": week_number, "games": len(rows)})

    # A fresh install has no active season, and leagues can only be created in one. The first
    # import that finds games makes its season active; later imports never switch seasons.
    if activator is not None and summary["weeks"]:
        summary["activated"] = activator.activate_if_none(season_id)
        if summary["activated"]:
            log.info("season activated", extra={"year": year})
    return summary


def run(request: JobRequest) -> JobResponse:
    from pickem.store import SupabaseScheduleStore  # imported lazily so tests need no client

    body = request.json() or {}
    year = int(body.get("year") or datetime.now(UTC).year)
    weeks = body.get("weeks")
    valid_weeks = isinstance(weeks, list) and all(
        isinstance(w, int) and 1 <= w <= 22 for w in weeks
    )
    if weeks is not None and not valid_weeks:
        return JobResponse(400, {"error": "weeks must be a list of integers 1-22"})

    store = SupabaseScheduleStore.from_settings(request.settings)
    run_id = store.start_run("sync_schedule", request.request_id)
    try:
        summary = sync_schedule(store, year=year, weeks=weeks, activator=store)
    except Exception as exc:
        store.finish_run(run_id, "failed", {"error": str(exc)})
        raise
    status = "succeeded" if not summary["errors"] else "failed"
    store.finish_run(run_id, status, summary)
    return JobResponse(
        200 if status == "succeeded" else 502, {"ok": status == "succeeded", **summary}
    )
