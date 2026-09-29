"""Environment configuration for jobs. Read lazily so importing a module never fails."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    job_secret: str | None
    supabase_url: str | None
    supabase_service_role_key: str | None
    app_url: str | None

    @property
    def job_secret_configured(self) -> bool:
        return bool(self.job_secret)

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)


def load_settings(env: dict[str, str] | None = None) -> Settings:
    source = os.environ if env is None else env
    return Settings(
        job_secret=source.get("JOB_SECRET") or None,
        supabase_url=source.get("SUPABASE_URL") or source.get("NEXT_PUBLIC_SUPABASE_URL") or None,
        supabase_service_role_key=source.get("SUPABASE_SERVICE_ROLE_KEY") or None,
        app_url=source.get("APP_URL") or None,
    )
