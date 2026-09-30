"""Enforce the minimum weekly action (docs/RULES.md #4, #6, #8).

POST /api/jobs/weekly_action_check  {}

Runs hourly from pg_cron. For every week whose last deadline has passed and that has not been
checked yet, it calls `weekly_action_check`, which gives members with no pick their bye (weeks
1-13, if unused) or puts one unit on the underdog of the week's last game. The database function
is idempotent and records per-member errors instead of failing the whole week.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any, Protocol

from pickem.log import get_logger
from pickem.vercel import JobRequest, JobResponse

log = get_logger("pickem.jobs.weekly_action_check")


class ActionStore(Protocol):
    def active_season(self) -> Mapping[str, Any] | None: ...
    def weeks_due_for_action_check(
        self, season_id: str, now: datetime
    ) -> list[Mapping[str, Any]]: ...
    def weekly_action_check(self, week_id: str) -> Mapping[str, Any]: ...
    def start_run(self, job_name: str, request_id: str) -> str: ...
    def finish_run(self, run_id: str, status: str, detail: Mapping[str, Any]) -> None: ...


def weekly_action_check(store: ActionStore, *, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    season = store.active_season()
    if season is None:
        return {"skipped": "no active season"}
    weeks = store.weeks_due_for_action_check(season["id"], now)
    if not weeks:
        return {"skipped": "nothing due", "year": season["year"]}

    results: list[dict[str, Any]] = []
    for w in weeks:
        outcome = dict(store.weekly_action_check(w["id"]))
        outcome.setdefault("week", w["week_number"])
        results.append(outcome)
        errors = outcome.get("errors") or []
        log.info(
            "action check ran",
            extra={
                "week": outcome.get("week"),
                "byes": outcome.get("byes"),
                "forced": outcome.get("forced"),
                "errors": len(errors),
            },
        )
        for err in errors:
            log.warning("action check could not handle a member", extra=dict(err))

    return {
        "year": season["year"],
        "weeks": [int(w["week_number"]) for w in weeks],
        "byes": sum(int(r.get("byes") or 0) for r in results),
        "forced": sum(int(r.get("forced") or 0) for r in results),
        "errors": sum(len(r.get("errors") or []) for r in results),
        "results": results,
    }


def run(request: JobRequest) -> JobResponse:
    from pickem.store import SupabaseSettlementStore

    store = SupabaseSettlementStore.from_settings(request.settings)
    run_id = store.start_run("weekly_action_check", request.request_id)
    try:
        summary = weekly_action_check(store)
    except Exception as exc:
        store.finish_run(run_id, "failed", {"error": str(exc)})
        raise
    store.finish_run(run_id, "succeeded", summary)
    return JobResponse(200, {"ok": True, **summary})
