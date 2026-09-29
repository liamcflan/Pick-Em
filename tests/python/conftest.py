from __future__ import annotations

import http.client
import json
import threading
from collections.abc import Iterator
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

import pytest


@dataclass
class Served:
    host: str
    port: int

    def request(
        self,
        method: str,
        path: str,
        headers: dict[str, str] | None = None,
        body: bytes | None = None,
    ) -> tuple[int, dict[str, str], Any]:
        conn = http.client.HTTPConnection(self.host, self.port, timeout=5)
        conn.request(method, path, body=body, headers=headers or {})
        resp = conn.getresponse()
        raw = resp.read()
        conn.close()
        payload = json.loads(raw) if raw else None
        return resp.status, {k.lower(): v for k, v in resp.getheaders()}, payload


@pytest.fixture
def serve() -> Iterator[Any]:
    """Serve a Vercel-style handler class on a random local port for the duration of a test."""
    servers: list[HTTPServer] = []

    def _serve(handler_cls: type[BaseHTTPRequestHandler]) -> Served:
        server = HTTPServer(("127.0.0.1", 0), handler_cls)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        servers.append(server)
        return Served(*server.server_address[:2])

    yield _serve
    for server in servers:
        server.shutdown()
        server.server_close()
