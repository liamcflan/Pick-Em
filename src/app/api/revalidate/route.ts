import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { log } from "@/lib/log";

const bodySchema = z.object({ tags: z.array(z.string().min(1).max(100)).min(1).max(50) });

function secretMatches(presented: string | null, expected: string | undefined): boolean {
  if (!presented || !expected) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/revalidate  { tags: ["spreads:2026-07"] }
 * Called by the Python jobs after they write, so cached pages refresh exactly when data changes.
 */
export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (!secretMatches(request.headers.get("x-job-secret"), serverEnv().JOB_SECRET)) {
    log.warn("revalidate: unauthorized", { request_id: requestId });
    return NextResponse.json({ error: "unauthorized", request_id: requestId }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", request_id: requestId }, { status: 400 });
  }

  for (const tag of parsed.data.tags) revalidateTag(tag, "max");
  log.info("revalidated", { request_id: requestId, tags: parsed.data.tags });
  return NextResponse.json({ ok: true, tags: parsed.data.tags, request_id: requestId });
}
