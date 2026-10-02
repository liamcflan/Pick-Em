import { z } from "zod";

/**
 * Environment variables, validated once at import time so a misconfigured deploy fails loudly
 * instead of producing confusing auth errors at runtime.
 *
 * Only NEXT_PUBLIC_* values are ever shipped to the browser. The service-role key is deliberately
 * absent: the Next.js app never uses it (see docs/PLAN.md §8). Jobs read it from their own env.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

const serverSchema = z.object({
  JOB_SECRET: z.string().min(16).optional(),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

export function serverEnv() {
  return serverSchema.parse({ JOB_SECRET: process.env.JOB_SECRET });
}
