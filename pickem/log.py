"""Structured JSON logging with per-request context.

Every log line is one JSON object on stdout so Vercel's log drain (and any future collector) can
index it. ``request_id`` and ``job`` are attached automatically from context variables set by the
HTTP handler, so a job never has to thread them through by hand.
"""

from __future__ import annotations

import contextvars
import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None
)
job_name_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("job_name", default=None)

_RESERVED = {
    "name",
    "msg",
    "args",
    "levelname",
    "levelno",
    "pathname",
    "filename",
    "module",
    "exc_info",
    "exc_text",
    "stack_info",
    "lineno",
    "funcName",
    "created",
    "msecs",
    "relativeCreated",
    "thread",
    "threadName",
    "processName",
    "process",
    "taskName",
    "message",
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if request_id := request_id_var.get():
            payload["request_id"] = request_id
        if job := job_name_var.get():
            payload["job"] = job
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


_state = {"configured": False}


def configure_logging(level: int = logging.INFO) -> None:
    """Install the JSON formatter on the root logger exactly once."""
    if _state["configured"]:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    _state["configured"] = True


def get_logger(name: str) -> logging.Logger:
    configure_logging()
    return logging.getLogger(name)
