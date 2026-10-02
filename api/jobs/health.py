"""Vercel function: GET/POST /api/jobs/health (requires X-Job-Secret)."""

import sys
from pathlib import Path

# Vercel runs functions with the repository root as the working directory, but make the shared
# package importable regardless of how the module was loaded.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pickem.jobs.health import health
from pickem.vercel import make_handler


# Vercel only recognises a Python function by a top-level `class handler(...)` or `app = ...`;
# a plain `handler = ...` assignment is skipped, so subclass the generated class under that name.
class handler(make_handler(health, job_name="health")):
    pass
