"""Adapter between Vercel's Python function convention and plain job functions.

Vercel expects each ``api/**/*.py`` file to expose a ``handler`` class derived from
``BaseHTTPRequestHandler``. Writing that boilerplate in every job is error-prone and hard to test,
so jobs are plain functions ``(JobRequest) -> JobResponse`` and ``make_handler`` wraps them.

The wrapper is responsible for the cross-cutting concerns every job needs:

* rejecting requests without a valid ``X-Job-Secret`` header (constant-time compare),
* assigning a request id (``X-Request-Id`` header or a fresh UUID) and putting it in log context,
* turning uncaught exceptions into a 500 JSON body that still carries the request id.
"""

from __future__ import annotations

import hmac
import json
import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler
from typing import Any
from urllib.parse import parse_qs, urlsplit

from pickem.log import get_logger, job_name_var, request_id_var
from pickem.settings import Settings, load_settings

JOB_SECRET_HEADER = "x-job-secret"  # noqa: S105 - header name, not a secret
REQUEST_ID_HEADER = "x-request-id"


@dataclass
class JobRequest:
    method: str
    path: str
    headers: dict[str, str]
    query: dict[str, list[str]]
    body: bytes
    request_id: str
    settings: Settings

    def json(self) -> Any:
        return json.loads(self.body) if self.body else None


@dataclass
class JobResponse:
    status: int = 200
    body: dict[str, Any] = field(default_factory=dict)


JobFn = Callable[[JobRequest], JobResponse]


def is_authorized(headers: dict[str, str], settings: Settings) -> bool:
    presented = headers.get(JOB_SECRET_HEADER, "")
    expected = settings.job_secret or ""
    if not expected or not presented:
        return False
    return hmac.compare_digest(presented.encode(), expected.encode())


def dispatch(fn: JobFn, request: JobRequest, *, job_name: str, log: logging.Logger) -> JobResponse:
    """Run ``fn`` with auth, logging and error handling applied. Pure: no HTTP objects."""
    tokens = (request_id_var.set(request.request_id), job_name_var.set(job_name))
    try:
        if not request.settings.job_secret_configured:
            log.error("JOB_SECRET is not configured")
            return JobResponse(
                500, {"error": "job secret not configured", "request_id": request.request_id}
            )
        if not is_authorized(request.headers, request.settings):
            log.warning("rejected request without valid job secret")
            return JobResponse(401, {"error": "unauthorized", "request_id": request.request_id})
        log.info("job started", extra={"method": request.method, "path": request.path})
        try:
            response = fn(request)
        except Exception:
            log.exception("job crashed")
            return JobResponse(500, {"error": "internal error", "request_id": request.request_id})
        response.body.setdefault("request_id", request.request_id)
        log.info("job finished", extra={"status": response.status})
        return response
    finally:
        request_id_var.reset(tokens[0])
        job_name_var.reset(tokens[1])


def make_handler(fn: JobFn, *, job_name: str) -> type[BaseHTTPRequestHandler]:
    log = get_logger(f"pickem.jobs.{job_name}")

    class Handler(BaseHTTPRequestHandler):
        server_version = "pickem-jobs"

        def _build_request(self) -> JobRequest:
            parts = urlsplit(self.path)
            headers = {k.lower(): v for k, v in self.headers.items()}
            length = int(headers.get("content-length") or 0)
            body = self.rfile.read(length) if length else b""
            return JobRequest(
                method=self.command,
                path=parts.path,
                headers=headers,
                query=parse_qs(parts.query),
                body=body,
                request_id=headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4()),
                settings=load_settings(),
            )

        def _respond(self, response: JobResponse, request_id: str) -> None:
            payload = json.dumps(response.body, default=str).encode()
            self.send_response(response.status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("X-Request-Id", request_id)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)

        def _handle(self) -> None:
            request = self._build_request()
            response = dispatch(fn, request, job_name=job_name, log=log)
            self._respond(response, request.request_id)

        def do_GET(self) -> None:
            self._handle()

        def do_POST(self) -> None:
            self._handle()

        def log_message(self, format: str, *args: Any) -> None:
            # Silence the default stderr access log; the JSON logger covers it.
            return

    return Handler
