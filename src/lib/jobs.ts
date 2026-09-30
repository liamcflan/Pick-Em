import "server-only";

import { headers } from "next/headers";

import { publicEnv, serverEnv } from "@/lib/env";
import { errorFields, log } from "@/lib/log";

export type JobName = "health" | "sync_schedule" | "lock_lines";

export type JobResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; body?: Record<string, unknown> };

async function appOrigin(): Promise<string> {
  if (publicEnv.NEXT_PUBLIC_APP_URL) return publicEnv.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

/**
 * Invoke one of the Python job functions with the shared secret. Server-side only; the secret
 * never leaves the server. Callers must already have checked the user is a site admin.
 */
export async function runJob(
  name: JobName,
  payload: Record<string, unknown> = {},
): Promise<JobResult> {
  const secret = serverEnv().JOB_SECRET;
  if (!secret)
    return { ok: false, status: 500, error: "JOB_SECRET is not configured on the server." };

  const requestId = crypto.randomUUID();
  const url = `${await appOrigin()}/api/jobs/${name}`;
  log.info("job invoked", { job: name, request_id: requestId });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-job-secret": secret,
        "x-request-id": requestId,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      log.warn("job failed", { job: name, request_id: requestId, status: res.status });
      return {
        ok: false,
        status: res.status,
        error: typeof body.error === "string" ? body.error : `Job returned HTTP ${res.status}`,
        body,
      };
    }
    return { ok: true, status: res.status, body };
  } catch (err) {
    log.error("job unreachable", { job: name, request_id: requestId, ...errorFields(err) });
    return {
      ok: false,
      status: 0,
      error:
        "Could not reach the job endpoint. On Vercel the Python functions deploy with the app; locally run `vercel dev` instead of `next dev`.",
    };
  }
}
