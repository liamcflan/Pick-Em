"""Vercel function: POST /api/jobs/lock_lines (requires X-Job-Secret)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pickem.jobs.lock_lines import run
from pickem.vercel import make_handler


# Vercel only recognises a Python function by a top-level `class handler(...)` or `app = ...`;
# a plain `handler = ...` assignment is skipped, so subclass the generated class under that name.
class handler(make_handler(run, job_name="lock_lines")):
    pass
