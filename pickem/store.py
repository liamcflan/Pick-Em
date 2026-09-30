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
