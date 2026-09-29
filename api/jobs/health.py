"""Vercel function: GET/POST /api/jobs/health (requires X-Job-Secret)."""

import sys
from pathlib import Path

# Vercel runs functions with the repository root as the working directory, but make the shared
# package importable regardless of how the module was loaded.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pickem.jobs.health import health
from pickem.vercel import make_handler

handler = make_handler(health, job_name="health")
