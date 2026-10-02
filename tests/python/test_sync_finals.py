from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from test_sync_schedule import FakeStore as ScheduleFake
from test_sync_schedule import fetch_fixture

from pickem.jobs.sync_finals import sync_finals

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=UTC)


class FakeStore(ScheduleFake):
    def __init__(self, weeks: list[dict[str, Any]] | None = None, season: bool = True) -> None:
        super().__init__()
        self.season = season
        self.in_play = weeks if weeks is not None else [{"id": "week-5", "week_number": 5}]
        self.settled: list[str] = []

    def active_season(self) -> Mapping[str, Any] | None:
        return {"id": "season-2026", "year": 2026} if self.season else None

    def started_unsettled_weeks(self, season_id: str, now: datetime) -> list[Mapping[str, Any]]:
        return list(self.in_play)

    def settle_week(self, week_id: str) -> Mapping[str, Any]:
        self.settled.append(week_id)
        ready = week_id == "week-5"
        return {"ready": ready, "week": 5 if ready else 6, "picks_settled": 3, "eliminated": 1}


def test_skips_without_a_season() -> None:
    out = sync_finals(FakeStore(season=False), fetch=fetch_fixture, now=NOW)
    assert out["skipped"] == "no active season"


def test_skips_when_no_week_has_started() -> None:
    store = FakeStore(weeks=[])
    out = sync_finals(store, fetch=fetch_fixture, now=NOW)
    assert out["skipped"] == "no weeks in play" and store.games == {}


def test_refreshes_scores_then_settles_each_week() -> None:
    store = FakeStore()
    out = sync_finals(store, fetch=fetch_fixture, now=NOW)
    assert out["weeks"] == [5]
    assert out["games_synced"] == 3  # the fixture's three games were upserted with scores
    assert store.settled == ["week-5"]
    assert out["weeks_settled"] == 1
    assert out["results"][0]["eliminated"] == 1


def test_reports_unready_weeks_without_failing() -> None:
    store = FakeStore(
        weeks=[{"id": "week-5", "week_number": 5}, {"id": "week-6", "week_number": 6}]
    )

    def fetch(year: int, week: int) -> Mapping[str, Any]:
        if week == 6:
            raise RuntimeError("espn down")
        return fetch_fixture(year, week)

    out = sync_finals(store, fetch=fetch, now=NOW)
    assert out["weeks_settled"] == 1
    assert [r["ready"] for r in out["results"]] == [True, False]
    assert out["fetch_errors"][0]["week"] == 6
