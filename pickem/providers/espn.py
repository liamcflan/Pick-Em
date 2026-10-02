"""ESPN public scoreboard: schedule, live scores and status for NFL games.

Unofficial and undocumented, so everything is parsed defensively and the parse functions are pure
(fixtures in tests/python/fixtures). Endpoint:
  https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=<year>&seasontype=2&week=<n>
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx

SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
REGULAR_SEASON = 2

# ESPN status names -> our game_status enum
STATUS_MAP: dict[str, str] = {
    "STATUS_SCHEDULED": "scheduled",
    "STATUS_DELAYED": "scheduled",
    "STATUS_IN_PROGRESS": "in_progress",
    "STATUS_HALFTIME": "in_progress",
    "STATUS_END_PERIOD": "in_progress",
    "STATUS_FINAL": "final",
    "STATUS_FINAL_OVERTIME": "final",
    "STATUS_POSTPONED": "postponed",
    "STATUS_CANCELED": "void",
    "STATUS_CANCELLED": "void",
    "STATUS_FORFEIT": "void",
    "STATUS_ABANDONED": "void",
}


@dataclass(frozen=True)
class ScoreboardGame:
    espn_event_id: str
    season_year: int
    week_number: int
    kickoff_at: datetime
    home_espn_team_id: int
    away_espn_team_id: int
    home_abbreviation: str
    away_abbreviation: str
    status: str
    status_detail: str | None
    home_score: int | None
    away_score: int | None
    period: int | None
    clock: str | None
    neutral_site: bool
    home_spread: float | None  # ESPN BET consensus at fetch time; negative = home favoured


def scoreboard_url(year: int, week: int, season_type: int = REGULAR_SEASON) -> str:
    return f"{SCOREBOARD_URL}?dates={year}&seasontype={season_type}&week={week}"


def fetch_scoreboard(year: int, week: int, *, client: httpx.Client | None = None) -> dict[str, Any]:
    """GET the scoreboard for one week. Raises httpx.HTTPStatusError on non-2xx."""
    own = client is None
    client = client or httpx.Client(timeout=15.0, headers={"User-Agent": "pick-em/0.1"})
    try:
        response = client.get(scoreboard_url(year, week))
        response.raise_for_status()
        return response.json()
    finally:
        if own:
            client.close()


def _parse_datetime(value: str) -> datetime:
    # ESPN uses "2026-10-04T17:00Z"
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def _int_or_none(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_spread(competition: Mapping[str, Any], home_abbr: str) -> float | None:
    """ESPN's `odds[0].spread` is relative to the home team when present. Fall back to parsing
    `details` such as "NYG -3.5" and flipping the sign if it names the away team."""
    odds_list = competition.get("odds") or []
    if not odds_list:
        return None
    odds = odds_list[0]
    spread = odds.get("spread")
    if isinstance(spread, int | float):
        return float(spread)
    details = odds.get("details")
    if not isinstance(details, str) or details.strip().upper() in {"", "EVEN", "PK", "PICK"}:
        return 0.0 if isinstance(details, str) and details.strip() else None
    parts = details.split()
    if len(parts) != 2:
        return None
    team, number = parts
    try:
        value = float(number)
    except ValueError:
        return None
    return value if team.upper() == home_abbr.upper() else -value


def parse_scoreboard(payload: Mapping[str, Any]) -> list[ScoreboardGame]:
    """Turn a scoreboard payload into games. Skips anything that is not a regular-season event
    with exactly one home and one away competitor."""
    games: list[ScoreboardGame] = []
    for event in payload.get("events") or []:
        season = event.get("season") or {}
        if int(season.get("type", REGULAR_SEASON)) != REGULAR_SEASON:
            continue
        competitions = event.get("competitions") or []
        if not competitions:
            continue
        comp = competitions[0]
        competitors = comp.get("competitors") or []
        home = next((c for c in competitors if c.get("homeAway") == "home"), None)
        away = next((c for c in competitors if c.get("homeAway") == "away"), None)
        if home is None or away is None:
            continue
        status_type = ((comp.get("status") or event.get("status") or {}).get("type")) or {}
        status_name = status_type.get("name", "STATUS_SCHEDULED")
        home_abbr = str(home["team"].get("abbreviation", "")).upper()
        away_abbr = str(away["team"].get("abbreviation", "")).upper()
        games.append(
            ScoreboardGame(
                espn_event_id=str(event["id"]),
                season_year=int(season.get("year") or payload.get("season", {}).get("year")),
                week_number=int((event.get("week") or payload.get("week") or {}).get("number")),
                kickoff_at=_parse_datetime(comp.get("date") or event["date"]),
                home_espn_team_id=int(home["team"]["id"]),
                away_espn_team_id=int(away["team"]["id"]),
                home_abbreviation=home_abbr,
                away_abbreviation=away_abbr,
                status=STATUS_MAP.get(status_name, "scheduled"),
                status_detail=status_type.get("shortDetail") or status_type.get("detail"),
                home_score=_int_or_none(home.get("score")),
                away_score=_int_or_none(away.get("score")),
                period=_int_or_none((comp.get("status") or {}).get("period")),
                clock=(comp.get("status") or {}).get("displayClock"),
                neutral_site=bool(comp.get("neutralSite", False)),
                home_spread=_parse_spread(comp, home_abbr),
            )
        )
    return games
