"""Outbound email through Resend's HTTP API (https://resend.com). One tiny function behind a
Protocol so jobs are testable with a fake and the app works without email configured."""

from __future__ import annotations

from typing import Protocol

import httpx

RESEND_URL = "https://api.resend.com/emails"


class Mailer(Protocol):
    def send(self, *, to: str, subject: str, text: str) -> None: ...


class ResendMailer:
    def __init__(self, api_key: str, sender: str, client: httpx.Client | None = None) -> None:
        self.api_key = api_key
        self.sender = sender
        self.client = client or httpx.Client(timeout=15.0)

    def send(self, *, to: str, subject: str, text: str) -> None:
        response = self.client.post(
            RESEND_URL,
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"from": self.sender, "to": [to], "subject": subject, "text": text},
        )
        response.raise_for_status()
