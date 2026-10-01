"""Email members who have nothing in for a week whose last deadline is a couple of hours away.

POST /api/jobs/send_reminders  {}

Hourly from pg_cron. The database says who is due (`picks_due_reminders`: active, not eliminated,
opted in, no pick and no bye this week, not already reminded); this job writes the message, sends
it through Resend and records it so nobody is nagged twice. Without RESEND_API_KEY it reports
"not configured" and sends nothing.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol
from zoneinfo import ZoneInfo

from pickem.log import get_logger
from pickem.mail import Mailer
from pickem.vercel import JobRequest, JobResponse

log = get_logger("pickem.jobs.send_reminders")

WINDOW_FROM = timedelta(hours=1)
WINDOW_TO = timedelta(hours=3)


class ReminderStore(Protocol):
    def active_season(self) -> Mapping[str, Any] | None: ...
    def settings(self) -> Mapping[str, Any]: ...
    def weeks_with_deadline_between(
        self, season_id: str, start: datetime, end: datetime
    ) -> list[Mapping[str, Any]]: ...
    def picks_due_reminders(self, week_id: str) -> list[Mapping[str, Any]]: ...
    def record_reminder(self, user_id: str, league_id: str, week_id: str) -> None: ...
    def start_run(self, job_name: str, request_id: str) -> str: ...
    def finish_run(self, run_id: str, status: str, detail: Mapping[str, Any]) -> None: ...


def _parse_ts(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def compose(row: Mapping[str, Any], *, app_url: str, timezone: str) -> tuple[str, str]:
    """(subject, body) for one reminder. Pure."""
    deadline = _parse_ts(row["deadline_at"]).astimezone(ZoneInfo(timezone))
    when = (
        deadline.strftime("%-I:%M %p %Z today")
        if deadline.date() == datetime.now(ZoneInfo(timezone)).date()
        else deadline.strftime("%A %-I:%M %p %Z")
    )
    dollars = int(row.get("available_cents") or 0) // 100
    week = row["week_number"]
    league = row["league_name"]
    subject = f"Picks lock at {when} — nothing in for week {week} ({league})"
    body = (
        f"Hi {row.get('display_name') or 'there'},\n\n"
        f"Week {week} picks in {league} lock at {when} and you have no bet in yet. "
        f"You have ${dollars:,} available.\n\n"
        f"If you do nothing, your bye is used (weeks 1-13, once a season) or 1k goes on the "
        f"underdog of the week's last game.\n\n"
        f"Make your picks: {app_url}/leagues/{row['league_id']}/picks\n\n"
        f"Turn these reminders off any time on your profile: {app_url}/profile\n"
    )
    return subject, body


def send_reminders(
    store: ReminderStore,
    mailer: Mailer | None,
    *,
    app_url: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    if mailer is None:
        return {"skipped": "email not configured (RESEND_API_KEY)"}
    season = store.active_season()
    if season is None:
        return {"skipped": "no active season"}
    weeks = store.weeks_with_deadline_between(season["id"], now + WINDOW_FROM, now + WINDOW_TO)
    if not weeks:
        return {"skipped": "no deadline in the next few hours", "year": season["year"]}
    timezone = str(store.settings().get("timezone", "America/New_York"))

    sent = 0
    failed: list[dict[str, Any]] = []
    for w in weeks:
        for row in store.picks_due_reminders(w["id"]):
            subject, body = compose(row, app_url=app_url, timezone=timezone)
            try:
                mailer.send(to=str(row["email"]), subject=subject, text=body)
            except Exception as exc:
                log.warning("reminder failed", extra={"user_id": row["user_id"], "error": str(exc)})
                failed.append({"user_id": row["user_id"], "league_id": row["league_id"]})
                continue
            store.record_reminder(str(row["user_id"]), str(row["league_id"]), str(w["id"]))
            sent += 1
    log.info("reminders sent", extra={"sent": sent, "failed": len(failed)})
    return {
        "year": season["year"],
        "weeks": [int(w["week_number"]) for w in weeks],
        "sent": sent,
        "failed": failed,
    }


def run(request: JobRequest) -> JobResponse:
    from pickem.mail import ResendMailer
    from pickem.store import SupabaseSettlementStore

    settings = request.settings
    mailer = (
        ResendMailer(settings.resend_api_key, settings.reminder_from)
        if settings.resend_api_key and settings.reminder_from
        else None
    )
    store = SupabaseSettlementStore.from_settings(settings)
    run_id = store.start_run("send_reminders", request.request_id)
    try:
        summary = send_reminders(store, mailer, app_url=settings.app_url or "")
    except Exception as exc:
        store.finish_run(run_id, "failed", {"error": str(exc)})
        raise
    store.finish_run(run_id, "succeeded", summary)
    return JobResponse(200, {"ok": True, **summary})
