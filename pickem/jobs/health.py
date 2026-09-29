"""Health check: proves the Python runtime, env wiring and job-secret gate work in production."""

from __future__ import annotations

import sys

from pickem.vercel import JobRequest, JobResponse


def health(request: JobRequest) -> JobResponse:
    return JobResponse(
        200,
        {
            "ok": True,
            "python": sys.version.split()[0],
            "supabase_configured": request.settings.supabase_configured,
        },
    )
