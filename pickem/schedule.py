"""Pure week-calendar math (no I/O) so it is unit-testable across DST boundaries."""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

# app_settings.spread_lock_day uses 0 = Sunday … 6 = Saturday (Postgres extract(dow) convention).
_DOW_TO_PY_WEEKDAY = {0: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5}


def week_window(
    first_kickoff_at: datetime,
    *,
    timezone: str = "America/New_York",
    lock_day: int = 3,
    lock_time: time = time(8, 0),
) -> tuple[datetime, datetime]:
    """Return (opens_at, spread_lock_at) in UTC for a week whose first game kicks off at the given
    instant. The lock is the most recent `lock_day` (default Wednesday) at `lock_time` local time
    on or before the first kickoff's local date; the week opens at 00:00 local the day before.
    """
    tz = ZoneInfo(timezone)
    local = first_kickoff_at.astimezone(tz)
    target = _DOW_TO_PY_WEEKDAY[lock_day]
    days_back = (local.weekday() - target) % 7
    lock_date = (local - timedelta(days=days_back)).date()
    lock_local = datetime.combine(lock_date, lock_time, tzinfo=tz)
    if lock_local > local:  # lock_time later than a same-day kickoff: use the previous week's day
        lock_local = datetime.combine(lock_date - timedelta(days=7), lock_time, tzinfo=tz)
    opens_local = datetime.combine(lock_date - timedelta(days=1), time(0, 0), tzinfo=tz)
    return opens_local.astimezone(UTC), lock_local.astimezone(UTC)


def deadline_for(kickoff_at: datetime, *, timezone: str = "America/New_York") -> datetime:
    """23:59 local on the calendar day before kickoff (mirrors the Postgres trigger; used for
    display and tests only — the database is the source of truth)."""
    tz = ZoneInfo(timezone)
    local = kickoff_at.astimezone(tz)
    return datetime.combine(local.date() - timedelta(days=1), time(23, 59), tzinfo=tz).astimezone(
        UTC
    )
