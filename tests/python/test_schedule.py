from __future__ import annotations

from datetime import UTC, datetime, time

from pickem.schedule import deadline_for, week_window


def utc(*args: int) -> datetime:
    return datetime(*args, tzinfo=UTC)


def test_week_window_thursday_opener_in_edt() -> None:
    # Thu 1 Oct 2026 8:15pm EDT -> lock Wed 30 Sep 08:00 EDT (12:00Z),
    # opens Tue 29 Sep 00:00 EDT (04:00Z)
    opens, lock = week_window(utc(2026, 10, 2, 0, 15))
    assert lock == utc(2026, 9, 30, 12, 0)
    assert opens == utc(2026, 9, 29, 4, 0)


def test_week_window_across_dst_end() -> None:
    # Week starting Thu 5 Nov 2026 (EST from Nov 1): lock Wed 4 Nov 08:00 EST = 13:00Z
    opens, lock = week_window(utc(2026, 11, 6, 1, 15))
    assert lock == utc(2026, 11, 4, 13, 0)
    assert opens == utc(2026, 11, 3, 5, 0)


def test_week_window_respects_settings() -> None:
    # Tuesday 10:00 lock, Sunday-only week
    opens, lock = week_window(utc(2026, 10, 4, 17, 0), lock_day=2, lock_time=time(10, 0))
    assert lock == utc(2026, 9, 29, 14, 0)
    assert opens == utc(2026, 9, 28, 4, 0)


def test_week_window_same_day_kickoff_before_lock_time_uses_previous_week() -> None:
    # A Wednesday 7am kickoff cannot lock at Wednesday 8am; it locks the Wednesday before.
    _, lock = week_window(utc(2026, 9, 30, 11, 0))
    assert lock == utc(2026, 9, 23, 12, 0)


def test_deadline_matches_database_rule() -> None:
    assert deadline_for(utc(2026, 10, 4, 17, 0)) == utc(2026, 10, 4, 3, 59)  # EDT
    assert deadline_for(utc(2026, 11, 8, 18, 0)) == utc(2026, 11, 8, 4, 59)  # EST
    assert deadline_for(utc(2026, 11, 2, 1, 15)) == utc(
        2026, 11, 1, 3, 59
    )  # night of the fall-back
