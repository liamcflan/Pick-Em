"""Shared code for the Pick-Em data-pull jobs.

Vercel turns every file under ``api/`` into an HTTP function, so shared code lives here at the
repository root and the thin function files in ``api/jobs/`` import from it.
"""
