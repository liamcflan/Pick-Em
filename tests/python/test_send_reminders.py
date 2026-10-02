from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Any

from pickem.jobs.send_reminders import compose, send_reminders

NOW = datetime(2026, 10, 10, 1, 20, tzinfo=UTC)  # Fri 9:20 PM ET
DEADLINE = NOW + timedelta(hours=2, minutes=39)  # 11:59 PM ET


class FakeStore:
    def __init__(self, due: list[dict[str, Any]] | None = None) -> None:
        self.due = (
            due
            if due is not None
            else [
                {
                    "user_id": "u1",
                    "email": "bob@example.com",
                    "display_name": "Bob",
                    "league_id": "l1",
                    "league_name": "Degens",
                    "week_number": 6,
                    "deadline_at": DEADLINE.isoformat(),
                    "available_cents": 700000,
                }
            ]
        )
        self.recorded: list[tuple[str, str, str]] = []

    def active_season(self) -> Mapping[str, Any]:
        return {"id": "season", "year": 2026}

    def settings(self) -> Mapping[str, Any]:
        return {"timezone": "America/New_York"}

    def weeks_with_deadline_between(
        self, season_id: str, start: datetime, end: datetime
    ) -> list[Mapping[str, Any]]:
        return [{"id": "w6", "week_number": 6}] if start < DEADLINE <= end else []

    def picks_due_reminders(self, week_id: str) -> list[Mapping[str, Any]]:
        return list(self.due)

    def record_reminder(self, user_id: str, league_id: str, week_id: str) -> None:
        self.recorded.append((user_id, league_id, week_id))

    def start_run(self, job_name: str, request_id: str) -> str:
        return "run"

    def finish_run(self, run_id: str, status: str, detail: Mapping[str, Any]) -> None:
        pass


class FakeMailer:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.sent: list[dict[str, str]] = []

    def send(self, *, to: str, subject: str, text: str) -> None:
        if self.fail:
            raise RuntimeError("smtp down")
        self.sent.append({"to": to, "subject": subject, "text": text})


def test_skips_without_email_configured() -> None:
    out = send_reminders(FakeStore(), None, app_url="https://x", now=NOW)
    assert "not configured" in out["skipped"]


def test_sends_and_records_once_per_member() -> None:
    store, mailer = FakeStore(), FakeMailer()
    out = send_reminders(store, mailer, app_url="https://pickem.app", now=NOW)
    assert out["sent"] == 1 and out["failed"] == []
    assert store.recorded == [("u1", "l1", "w6")]
    msg = mailer.sent[0]
    assert msg["to"] == "bob@example.com"
    assert "week 6" in msg["subject"] and "Degens" in msg["subject"]
    assert "$7,000" in msg["text"]
    assert "https://pickem.app/leagues/l1/picks" in msg["text"]


def test_nothing_due_outside_the_window() -> None:
    store = FakeStore()
    out = send_reminders(store, FakeMailer(), app_url="https://x", now=NOW - timedelta(hours=6))
    assert out["skipped"].startswith("no deadline")


def test_failed_sends_are_not_recorded() -> None:
    store = FakeStore()
    out = send_reminders(store, FakeMailer(fail=True), app_url="https://x", now=NOW)
    assert out["sent"] == 0 and len(out["failed"]) == 1
    assert store.recorded == []


def test_compose_mentions_the_local_deadline() -> None:
    subject, body = compose(FakeStore().due[0], app_url="https://x", timezone="America/New_York")
    assert "11:59 PM" in subject
    assert "bye" in body
