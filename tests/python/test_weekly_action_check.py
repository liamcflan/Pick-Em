from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from pickem.jobs.weekly_action_check import weekly_action_check

NOW = datetime(2026, 10, 6, 4, 5, tzinfo=UTC)


class FakeStore:
    def __init__(self, due: list[dict[str, Any]] | None = None, season: bool = True) -> None:
        self.season = season
        self.due = due if due is not None else [{"id": "week-5", "week_number": 5}]
        self.checked: list[str] = []

    def active_season(self) -> Mapping[str, Any] | None:
        return {"id": "season-2026", "year": 2026} if self.season else None

    def weeks_due_for_action_check(self, season_id: str, now: datetime) -> list[Mapping[str, Any]]:
        return list(self.due)

    def weekly_action_check(self, week_id: str) -> Mapping[str, Any]:
        self.checked.append(week_id)
        return {
            "ready": True,
            "week": 5,
            "byes": 2,
            "forced": 1,
            "errors": [{"league_id": "l1", "user_id": "u9", "error": "no line"}],
        }

    def start_run(self, job_name: str, request_id: str) -> str:
        return "run"

    def finish_run(self, run_id: str, status: str, detail: Mapping[str, Any]) -> None:
        pass


def test_skips_without_a_season() -> None:
    assert weekly_action_check(FakeStore(season=False), now=NOW)["skipped"] == "no active season"


def test_skips_when_nothing_is_due() -> None:
    store = FakeStore(due=[])
    assert weekly_action_check(store, now=NOW)["skipped"] == "nothing due"
    assert store.checked == []


def test_runs_each_due_week_and_totals_the_outcome() -> None:
    store = FakeStore()
    out = weekly_action_check(store, now=NOW)
    assert store.checked == ["week-5"]
    assert (out["byes"], out["forced"], out["errors"]) == (2, 1, 1)
    assert out["weeks"] == [5]
