from __future__ import annotations

import json
import logging

from pickem.log import JsonFormatter, job_name_var, request_id_var


def test_json_formatter_includes_context_and_extras() -> None:
    record = logging.LogRecord("t", logging.INFO, __file__, 1, "hello %s", ("x",), None)
    record.status = 200  # type: ignore[attr-defined]
    t1 = request_id_var.set("rid")
    t2 = job_name_var.set("health")
    try:
        line = json.loads(JsonFormatter().format(record))
    finally:
        request_id_var.reset(t1)
        job_name_var.reset(t2)
    assert line["msg"] == "hello x"
    assert line["level"] == "info"
    assert line["request_id"] == "rid"
    assert line["job"] == "health"
    assert line["status"] == 200
    assert line["ts"].endswith("+00:00")
