"""Opt-in check against the real ESPN endpoint. Never runs in CI.

LIVE_API=1 uv run pytest tests/python/test_espn_live.py -q
"""

from __future__ import annotations

import os

import pytest

from pickem.providers.espn import fetch_scoreboard, parse_scoreboard

pytestmark = pytest.mark.skipif(
    os.environ.get("LIVE_API") != "1", reason="set LIVE_API=1 to hit ESPN"
)


def test_live_week_parses() -> None:
    games = parse_scoreboard(fetch_scoreboard(2026, 5))
    assert len(games) >= 12
    assert all(g.week_number == 5 and g.season_year == 2026 for g in games)
    assert all(g.home_espn_team_id != g.away_espn_team_id for g in games)
