"""Vercel function: POST /api/jobs/sync_live (requires X-Job-Secret)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pickem.jobs.sync_live import run
from pickem.vercel import make_handler

handler = make_handler(run, job_name="sync_live")
