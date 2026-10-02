from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from pickem.providers.espn import parse_scoreboard, scoreboard_url

FIXTURE = Path(__file__).parent / "fixtures" / "espn_scoreboard_2026_wk5.json"


def load() -> dict:
    return json.loads(FIXTURE.read_text())


def test_scoreboard_url() -> None:
    assert scoreboard_url(2026, 5).endswith("?dates=2026&seasontype=2&week=5")


def test_parse_skips_non_regular_season_and_keeps_order() -> None:
    games = parse_scoreboard(load())
    assert [g.espn_event_id for g in games] == ["401772801", "401772802", "401772803"]
    assert all(g.season_year == 2026 and g.week_number == 5 for g in games)


def test_parse_scheduled_game_with_away_favourite() -> None:
    g = parse_scoreboard(load())[0]
    assert g.kickoff_at == datetime(2026, 10, 2, 0, 15, tzinfo=UTC)
    assert (g.home_abbreviation, g.away_abbreviation) == ("NYG", "DAL")
    assert (g.home_espn_team_id, g.away_espn_team_id) == (19, 6)
    assert g.status == "scheduled"
    assert g.home_score == 0 and g.away_score == 0
    assert g.home_spread == 2.5  # DAL -2.5 means the home side is +2.5
    assert g.status_detail == "10/1 - 8:15 PM EDT"


def test_parse_final_game_spread_from_details_when_numeric_missing() -> None:
    g = parse_scoreboard(load())[1]
    assert g.status == "final"
    assert (g.home_score, g.away_score) == (24, 27)
    assert g.home_spread == -3.0  # "KC -3", KC is home


def test_parse_live_game_without_odds() -> None:
    g = parse_scoreboard(load())[2]
    assert g.status == "in_progress"
    assert g.period == 3 and g.clock == "12:34"
    assert g.home_spread is None


def test_parse_tolerates_empty_payload() -> None:
    assert parse_scoreboard({}) == []
    assert parse_scoreboard({"events": [{"id": "x", "competitions": []}]}) == []
