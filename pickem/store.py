"""Supabase-backed persistence for jobs (service role). Thin, no business logic."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from pickem.db import service_client
from pickem.settings import Settings
from supabase import Client


class SupabaseScheduleStore:
    def __init__(self, client: Client) -> None:
        self.client = client

    @classmethod
    def from_settings(cls, settings: Settings) -> SupabaseScheduleStore:
        return cls(service_client(settings))

    # -- settings -----------------------------------------------------------------------------
    def settings(self) -> Mapping[str, Any]:
        res = self.client.table("app_settings").select("*").eq("id", 1).single().execute()
        return res.data or {}

    # -- seasons / teams / weeks / games ----------------------------------------------------------
    def get_or_create_season(self, year: int) -> str:
        res = self.client.table("seasons").select("id").eq("year", year).limit(1).execute()
        if res.data:
            return res.data[0]["id"]
        created = self.client.table("seasons").insert({"year": year}).execute()
        return created.data[0]["id"]

    def team_ids_by_espn_id(self) -> dict[int, str]:
        res = self.client.table("teams").select("id, espn_team_id").execute()
        return {int(row["espn_team_id"]): row["id"] for row in res.data or []}

    def upsert_week(
        self, season_id: str, week_number: int, opens_at: datetime, lock_at: datetime
    ) -> str:
        res = (
            self.client.table("weeks")
            .upsert(
                {
                    "season_id": season_id,
                    "week_number": week_number,
                    "opens_at": opens_at.isoformat(),
                    "spread_lock_at": lock_at.isoformat(),
                },
                on_conflict="season_id,week_number",
            )
            .execute()
        )
        return res.data[0]["id"]

    def upsert_games(self, rows: list[dict[str, Any]]) -> int:
        if not rows:
            return 0
        res = self.client.table("games").upsert(rows, on_conflict="espn_event_id").execute()
        return len(res.data or [])

    # -- job runs ----------------------------------------------------------------------------
    def start_run(self, job_name: str, request_id: str) -> str:
        res = (
            self.client.table("job_runs")
            .insert({"job_name": job_name, "request_id": request_id, "status": "running"})
            .execute()
        )
        return res.data[0]["id"]

    def finish_run(self, run_id: str, status: str, detail: Mapping[str, Any]) -> None:
        self.client.table("job_runs").update(
            {"status": status, "finished_at": datetime.now(UTC).isoformat(), "detail": dict(detail)}
        ).eq("id", run_id).execute()


class SupabaseLineStore(SupabaseScheduleStore):
    """Adds the queries the line-lock job needs. Inherits job-run bookkeeping."""

    def active_season(self) -> Mapping[str, Any] | None:
        res = (
            self.client.table("seasons").select("id, year").eq("is_active", True).limit(1).execute()
        )
        return res.data[0] if res.data else None

    def week(self, season_id: str, week_number: int | None) -> Mapping[str, Any] | None:
        q = self.client.table("weeks").select("id, week_number, spread_lock_at, last_deadline_at")
        q = q.eq("season_id", season_id)
        if week_number is not None:
            q = q.eq("week_number", week_number)
        else:
            q = q.or_(
                f"last_deadline_at.is.null,last_deadline_at.gt.{datetime.now(UTC).isoformat()}"
            )
        res = q.order("week_number").limit(1).execute()
        return res.data[0] if res.data else None

    def games_with_current_lines(self, week_id: str) -> list[Mapping[str, Any]]:
        games = (
            self.client.table("games")
            .select("id, espn_event_id, status")
            .eq("week_id", week_id)
            .execute()
            .data
            or []
        )
        ids = [g["id"] for g in games]
        if not ids:
            return []
        lines = (
            self.client.table("lines")
            .select("game_id, source")
            .in_("game_id", ids)
            .eq("is_current", True)
            .execute()
            .data
            or []
        )
        source_by_game = {row["game_id"]: row["source"] for row in lines}
        return [{**g, "current_line_source": source_by_game.get(g["id"])} for g in games]

    def set_api_line(self, game_id: str, home_spread: float) -> None:
        self.client.rpc(
            "set_line", {"p_game_id": game_id, "p_home_spread": home_spread, "p_source": "api"}
        ).execute()

    def league_ids_for_season(self, season_id: str) -> list[str]:
        res = self.client.table("leagues").select("id").eq("season_id", season_id).execute()
        return [row["id"] for row in res.data or []]

    def post_event(self, league_id: str, kind: str, payload: Mapping[str, Any]) -> None:
        self.client.rpc(
            "post_league_event",
            {
                "p_league_id": league_id,
                "p_kind": kind,
                "p_actor": None,
                "p_subject": None,
                "p_payload": dict(payload),
            },
        ).execute()


class SupabaseSettlementStore(SupabaseLineStore):
    """Adds the queries the settlement and action-check jobs need."""

    def started_unsettled_weeks(self, season_id: str, now: datetime) -> list[Mapping[str, Any]]:
        res = (
            self.client.table("weeks")
            .select("id, week_number")
            .eq("season_id", season_id)
            .is_("settled_at", "null")
            .lte("first_kickoff_at", now.isoformat())
            .order("week_number")
            .execute()
        )
        return list(res.data or [])

    def settle_week(self, week_id: str) -> Mapping[str, Any]:
        res = self.client.rpc("settle_week", {"p_week_id": week_id}).execute()
        return res.data or {}

    def weeks_due_for_action_check(self, season_id: str, now: datetime) -> list[Mapping[str, Any]]:
        res = (
            self.client.table("weeks")
            .select("id, week_number")
            .eq("season_id", season_id)
            .is_("action_checked_at", "null")
            .lte("last_deadline_at", now.isoformat())
            .order("week_number")
            .execute()
        )
        return list(res.data or [])

    def weekly_action_check(self, week_id: str) -> Mapping[str, Any]:
        res = self.client.rpc("weekly_action_check", {"p_week_id": week_id}).execute()
        return res.data or {}

    def live_weeks(self, season_id: str, now: datetime) -> list[Mapping[str, Any]]:
        """Weeks with a game in progress, or one that kicked off in the last six hours / kicks
        off in the next fifteen minutes (ESPN can lag a little on the status flip)."""
        from datetime import timedelta

        lo = (now - timedelta(hours=6)).isoformat()
        hi = (now + timedelta(minutes=15)).isoformat()
        res = (
            self.client.table("games")
            .select("week_id, weeks(id, week_number)")
            .eq("season_id", season_id)
            .or_(
                f"status.eq.in_progress,and(status.eq.scheduled,kickoff_at.gte.{lo},kickoff_at.lte.{hi})"
            )
            .execute()
        )
        seen: dict[str, Mapping[str, Any]] = {}
        for row in res.data or []:
            week = row.get("weeks") or {}
            if week.get("id") and week["id"] not in seen:
                seen[week["id"]] = {"id": week["id"], "week_number": week["week_number"]}
        return sorted(seen.values(), key=lambda w: int(w["week_number"]))

    def weeks_with_deadline_between(
        self, season_id: str, start: datetime, end: datetime
    ) -> list[Mapping[str, Any]]:
        res = (
            self.client.table("weeks")
            .select("id, week_number, last_deadline_at")
            .eq("season_id", season_id)
            .gt("last_deadline_at", start.isoformat())
            .lte("last_deadline_at", end.isoformat())
            .order("week_number")
            .execute()
        )
        return list(res.data or [])

    def picks_due_reminders(self, week_id: str) -> list[Mapping[str, Any]]:
        res = self.client.rpc("picks_due_reminders", {"p_week_id": week_id}).execute()
        return list(res.data or [])

    def record_reminder(self, user_id: str, league_id: str, week_id: str) -> None:
        self.client.rpc(
            "record_reminder",
            {"p_user_id": user_id, "p_league_id": league_id, "p_week_id": week_id},
        ).execute()
