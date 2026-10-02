/**
 * Pure helpers behind the public /status page, which reports what a deployment is running and
 * which parts of the setup are missing, so a broken deploy can be diagnosed from a phone.
 */

export type CheckState = "ok" | "warn" | "fail";
export type Check = { label: string; state: CheckState; detail: string };

type PostgrestLikeError = { code?: string | null; message?: string | null } | null;

/**
 * Did a probe query fail because the table does not exist (migrations not applied)?
 * "Permission denied" means the table exists but this visitor may not read it, so it is present.
 */
export function schemaState(error: PostgrestLikeError): "present" | "missing" | "error" {
  if (!error) return "present";
  if (error.code === "42501") return "present";
  // PostgREST answers PGRST205 for a table missing from its schema cache; Postgres says 42P01 for
  // a missing table and 42703 for a missing column.
  if (error.code === "PGRST205" || error.code === "42P01" || error.code === "42703") {
    return "missing";
  }
  if (/could not find the table|does not exist/i.test(error.message ?? "")) return "missing";
  return "error";
}

export type BuildInfo = {
  environment: string;
  branch: string | null;
  commit: string | null;
  message: string | null;
};

/** Which build is live. Vercel sets the VERCEL_* system variables on every deployment. */
export function buildInfo(env: Record<string, string | undefined>): BuildInfo {
  return {
    environment: env.VERCEL_ENV ?? env.NODE_ENV ?? "unknown",
    branch: env.VERCEL_GIT_COMMIT_REF || null,
    commit: env.VERCEL_GIT_COMMIT_SHA ? env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
    message: env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0]?.trim() || null,
  };
}

/** The worst state among the checks, for the page summary. */
export function overall(checks: Check[]): CheckState {
  if (checks.some((c) => c.state === "fail")) return "fail";
  if (checks.some((c) => c.state === "warn")) return "warn";
  return "ok";
}
