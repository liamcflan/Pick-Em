"""Vercel function: POST /api/jobs/lock_lines (requires X-Job-Secret)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pickem.jobs.lock_lines import run
from pickem.vercel import make_handler

handler = make_handler(run, job_name="lock_lines")
