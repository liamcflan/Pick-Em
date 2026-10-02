from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pickem.jobs.sync_schedule import game_row, sync_schedule
from pickem.providers.espn import parse_scoreboard

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "espn_scoreboard_2026_wk5.json").read_text()
)

TEAMS = {19: "t-nyg", 6: "t-dal", 12: "t-kc", 2: "t-buf", 21: "t-phi", 9: "t-gb"}


class FakeStore:
    def __init__(self, teams: dict[int, str] | None = None) -> None:
        self.teams = TEAMS if teams is None else teams
        self.weeks: dict[tuple[str, int], dict[str, Any]] = {}
        self.games: dict[str, dict[str, Any]] = {}
        self.runs: list[dict[str, Any]] = []

    def settings(self) -> Mapping[str, Any]:
        return {
            "timezone": "America/New_York",
            "spread_lock_day": 3,
            "spread_lock_time": "08:00:00",
        }

    def get_or_create_season(self, year: int) -> str:
        return f"season-{year}"

    active_season: str | None = None

    def activate_if_none(self, season_id: str) -> bool:
        if self.active_season is not None:
            return False
        self.active_season = season_id
        return True

    def team_ids_by_espn_id(self) -> dict[int, str]:
        return dict(self.teams)

    def upsert_week(
        self, season_id: str, week_number: int, opens_at: datetime, lock_at: datetime
    ) -> str:
        key = (season_id, week_number)
        self.weeks[key] = {"opens_at": opens_at, "spread_lock_at": lock_at}
        return f"week-{week_number}"

    def upsert_games(self, rows: list[dict[str, Any]]) -> int:
        for row in rows:
            self.games[row["espn_event_id"]] = row
        return len(rows)

    def start_run(self, job_name: str, request_id: str) -> str:
        self.runs.append({"job": job_name, "request_id": request_id, "status": "running"})
        return "run-1"

    def finish_run(self, run_id: str, status: str, detail: Mapping[str, Any]) -> None:
        self.runs[-1].update({"status": status, "detail": dict(detail)})


def fetch_fixture(year: int, week: int) -> Mapping[str, Any]:
    assert (year, week) == (2026, 5)
    return FIXTURE


def test_sync_one_week_upserts_week_and_games() -> None:
    store = FakeStore()
    summary = sync_schedule(
        store, year=2026, weeks=[5], fetch=fetch_fixture, now=datetime(2026, 9, 30, tzinfo=UTC)
    )

    assert summary["weeks"] == 1 and summary["games"] == 3
    assert summary["unmatched"] == [] and summary["errors"] == []

    week = store.weeks[("season-2026", 5)]
    assert week["spread_lock_at"] == datetime(2026, 9, 30, 12, 0, tzinfo=UTC)  # Wed 8am EDT
    assert week["opens_at"] == datetime(2026, 9, 29, 4, 0, tzinfo=UTC)

    g = store.games["401772802"]
    assert g["week_id"] == "week-5" and g["season_id"] == "season-2026"
    assert (g["home_team_id"], g["away_team_id"]) == ("t-kc", "t-buf")
    assert g["status"] == "final" and (g["home_score"], g["away_score"]) == (24, 27)
    assert g["kickoff_at"] == "2026-10-04T17:00:00+00:00"
    assert "deadline_at" not in g  # the database computes deadlines; the job never sends one


def test_unknown_team_is_reported_not_inserted() -> None:
    store = FakeStore(teams={k: v for k, v in TEAMS.items() if k != 9})  # drop GB
    summary = sync_schedule(store, year=2026, weeks=[5], fetch=fetch_fixture)
    assert summary["games"] == 2
    assert summary["unmatched"] == [{"event": "401772803", "home": 21, "away": 9}]


def test_fetch_failure_is_recorded_and_other_weeks_continue() -> None:
    calls: list[int] = []

    def flaky(year: int, week: int) -> Mapping[str, Any]:
        calls.append(week)
        if week == 4:
            raise RuntimeError("boom")
        return FIXTURE if week == 5 else {"events": []}

    store = FakeStore()
    summary = sync_schedule(store, year=2026, weeks=[4, 5, 6], fetch=flaky)
    assert calls == [4, 5, 6]
    assert summary["errors"] == [{"week": 4, "error": "boom"}]
    assert summary["weeks"] == 1 and summary["games"] == 3


def test_game_row_none_for_unknown_team() -> None:
    g = parse_scoreboard(FIXTURE)[0]
    assert game_row(g, season_id="s", week_id="w", team_ids={}, now=datetime.now(UTC)) is None


def test_first_import_activates_its_season() -> None:
    store = FakeStore()
    summary = sync_schedule(store, year=2026, weeks=[5], fetch=fetch_fixture, activator=store)
    assert summary["activated"] is True
    assert store.active_season == "season-2026"


def test_import_never_switches_an_active_season() -> None:
    store = FakeStore()
    store.active_season = "season-2025"
    summary = sync_schedule(store, year=2026, weeks=[5], fetch=fetch_fixture, activator=store)
    assert summary["activated"] is False
    assert store.active_season == "season-2025"


def test_import_without_games_does_not_activate() -> None:
    store = FakeStore()
    summary = sync_schedule(
        store, year=2026, weeks=[6], fetch=lambda y, w: {"events": []}, activator=store
    )
    assert summary["weeks"] == 0 and summary["activated"] is False
    assert store.active_season is None


def test_finals_and_live_reuse_do_not_activate() -> None:
    store = FakeStore()
    summary = sync_schedule(store, year=2026, weeks=[5], fetch=fetch_fixture)
    assert summary["activated"] is False and store.active_season is None
