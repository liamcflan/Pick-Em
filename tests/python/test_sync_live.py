from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from test_sync_finals import FakeStore as FinalsFake
from test_sync_schedule import fetch_fixture

from pickem.jobs.sync_live import sync_live

NOW = datetime(2026, 10, 4, 18, 30, tzinfo=UTC)


class FakeStore(FinalsFake):
    def __init__(self, live: list[dict[str, Any]] | None = None) -> None:
        super().__init__()
        self.live = live if live is not None else [{"id": "week-5", "week_number": 5}]

    def live_weeks(self, season_id: str, now: datetime) -> list[Mapping[str, Any]]:
        return list(self.live)


def test_exits_immediately_when_nothing_is_live() -> None:
    store = FakeStore(live=[])
    out = sync_live(store, fetch=fetch_fixture, now=NOW)
    assert out["skipped"] == "no games in play"
    assert store.games == {} and store.settled == []


def test_refreshes_and_settles_only_the_live_weeks() -> None:
    store = FakeStore()
    out = sync_live(store, fetch=fetch_fixture, now=NOW)
    assert out["weeks"] == [5]
    assert out["games_synced"] == 3
    assert store.settled == ["week-5"]
