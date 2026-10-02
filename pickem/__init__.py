"""Shared code for the 10K Pool HQ data-pull jobs (repository: pick-em).

Vercel turns every file under ``api/`` into an HTTP function, so shared code lives here at the
repository root and the thin function files in ``api/jobs/`` import from it.
"""
