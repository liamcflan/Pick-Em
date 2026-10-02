from __future__ import annotations

import json
import logging

import pytest

from pickem.jobs.health import health
from pickem.settings import Settings, load_settings
from pickem.vercel import JobRequest, JobResponse, dispatch, make_handler

SECRET = "test-secret"


def _request(headers: dict[str, str] | None = None, settings: Settings | None = None) -> JobRequest:
    return JobRequest(
        method="POST",
        path="/api/jobs/x",
        headers=headers or {},
        query={},
        body=b"",
        request_id="req-1",
        settings=settings or load_settings({"JOB_SECRET": SECRET}),
    )


def test_dispatch_rejects_missing_secret() -> None:
    response = dispatch(health, _request(), job_name="health", log=logging.getLogger("t"))
    assert response.status == 401
    assert response.body == {"error": "unauthorized", "request_id": "req-1"}


def test_dispatch_rejects_wrong_secret() -> None:
    response = dispatch(
        health, _request({"x-job-secret": "nope"}), job_name="health", log=logging.getLogger("t")
    )
    assert response.status == 401


def test_dispatch_fails_closed_when_secret_unconfigured() -> None:
    response = dispatch(
        health,
        _request({"x-job-secret": SECRET}, settings=load_settings({})),
        job_name="health",
        log=logging.getLogger("t"),
    )
    assert response.status == 500
    assert "not configured" in response.body["error"]


def test_dispatch_runs_job_and_attaches_request_id() -> None:
    response = dispatch(
        health, _request({"x-job-secret": SECRET}), job_name="health", log=logging.getLogger("t")
    )
    assert response.status == 200
    assert response.body["ok"] is True
    assert response.body["request_id"] == "req-1"
    assert response.body["supabase_configured"] is False


def test_dispatch_turns_exceptions_into_500_with_request_id() -> None:
    def boom(_: JobRequest) -> JobResponse:
        raise RuntimeError("kaboom")

    response = dispatch(
        boom, _request({"x-job-secret": SECRET}), job_name="boom", log=logging.getLogger("t")
    )
    assert response.status == 500
    assert response.body == {"error": "internal error", "request_id": "req-1"}


def test_handler_end_to_end_over_http(serve, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JOB_SECRET", SECRET)
    monkeypatch.setenv("SUPABASE_URL", "http://localhost:54321")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service")
    served = serve(make_handler(health, job_name="health"))

    status, headers, body = served.request("GET", "/api/jobs/health?x=1")
    assert status == 401
    assert headers["content-type"] == "application/json"
    assert body["error"] == "unauthorized"
    assert headers["x-request-id"] == body["request_id"]

    status, headers, body = served.request(
        "POST",
        "/api/jobs/health",
        headers={"X-Job-Secret": SECRET, "X-Request-Id": "abc-123"},
        body=json.dumps({"hello": "world"}).encode(),
    )
    assert status == 200
    assert body["ok"] is True
    assert body["request_id"] == "abc-123"
    assert headers["x-request-id"] == "abc-123"
    assert body["supabase_configured"] is True
