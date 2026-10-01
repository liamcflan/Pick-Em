"""Vercel function: POST /api/jobs/send_reminders (requires X-Job-Secret)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pickem.jobs.send_reminders import run
from pickem.vercel import make_handler

handler = make_handler(run, job_name="send_reminders")
