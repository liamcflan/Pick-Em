"""Service-role Supabase client for jobs. Never imported by the Next.js app."""

from __future__ import annotations

from functools import lru_cache

from pickem.settings import Settings
from supabase import Client, create_client


class NotConfiguredError(RuntimeError):
    pass


@lru_cache(maxsize=4)
def _client(url: str, key: str) -> Client:
    return create_client(url, key)


def service_client(settings: Settings) -> Client:
    if not settings.supabase_configured:
        raise NotConfiguredError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return _client(str(settings.supabase_url), str(settings.supabase_service_role_key))
