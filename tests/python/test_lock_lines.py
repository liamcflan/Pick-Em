from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pickem.jobs.lock_lines import lock_lines

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "espn_scoreboard_2026_wk5.json").read_text()
)
LOCK_AT = datetime(2026, 9, 30, 12, 0, tzinfo=UTC)


class FakeStore:
    def __init__(self, existing: dict[str, str] | None = None) -> None:
        self.existing = existing or {}
        self.lines: list[tuple[str, float]] = []
        self.events: list[tuple[str, str, dict[str, Any]]] = []
        self.leagues = ["league-a", "league-b"]

    def active_season(self) -> Mapping[str, Any]:
        return {"id": "season-2026", "year": 2026}

    def week(self, season_id: str, week_number: int | None) -> Mapping[str, Any]:
        return {"id": "week-5", "week_number": 5, "spread_lock_at": LOCK_AT.isoformat()}

    def games_with_current_lines(self, week_id: str) -> list[Mapping[str, Any]]:
        return [
            {
                "id": "g1",
                "espn_event_id": "401772801",
                "status": "scheduled",
                "current_line_source": self.existing.get("g1"),
            },
            {
                "id": "g2",
                "espn_event_id": "401772802",
                "status": "final",
                "current_line_source": None,
            },
            {
                "id": "g3",
                "espn_event_id": "401772803",
                "status": "scheduled",
                "current_line_source": self.existing.get("g3"),
            },
        ]

    def set_api_line(self, game_id: str, home_spread: float) -> None:
        self.lines.append((game_id, home_spread))

    def league_ids_for_season(self, season_id: str) -> list[str]:
        return list(self.leagues)

    def post_event(self, league_id: str, kind: str, payload: Mapping[str, Any]) -> None:
        self.events.append((league_id, kind, dict(payload)))

    def start_run(self, job_name: str, request_id: str) -> str:
        return "run"

    def finish_run(self, run_id: str, status: str, detail: Mapping[str, Any]) -> None:
        pass


def fetch(year: int, week: int) -> Mapping[str, Any]:
    return FIXTURE


def test_does_nothing_before_lock_time() -> None:
    store = FakeStore()
    out = lock_lines(store, fetch=fetch, now=LOCK_AT.replace(hour=11))
    assert out["skipped"] == "before spread_lock_at"
    assert store.lines == [] and store.events == []


def test_locks_lines_and_posts_one_event_per_league() -> None:
    store = FakeStore()
    out = lock_lines(store, fetch=fetch, now=LOCK_AT)
    # g1 has a spread (+2.5 home), g2 is final (skipped), g3 has no odds in the fixture
    assert store.lines == [("g1", 2.5)]
    assert out["locked"] == 1 and out["missing_spread"] == ["401772803"]
    assert store.events == [
        ("league-a", "spreads_locked", {"week": 5}),
        ("league-b", "spreads_locked", {"week": 5}),
    ]


def test_existing_lines_are_kept_and_no_duplicate_event() -> None:
    store = FakeStore(existing={"g1": "admin"})
    out = lock_lines(store, fetch=fetch, now=LOCK_AT)
    assert store.lines == [] and out["skipped_existing"] == 1
    assert store.events == []  # the week already had lines, so no announcement


def test_force_overwrites_and_ignores_lock_time() -> None:
    store = FakeStore(existing={"g1": "admin"})
    out = lock_lines(store, fetch=fetch, now=LOCK_AT.replace(hour=1), force=True)
    assert store.lines == [("g1", 2.5)] and out["locked"] == 1
