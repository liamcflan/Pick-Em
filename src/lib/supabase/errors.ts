import type { PostgrestError } from "@supabase/supabase-js";

/** Map Postgres error codes raised by our functions to sentences a member can act on. */
export function friendlyDbError(
  error: PostgrestError | null | undefined,
  fallback = "Something went wrong.",
): string {
  if (!error) return fallback;
  switch (error.code) {
    case "P0002":
      return "That invite code was not found.";
    case "23505":
      return error.message.includes("already a member")
        ? "You are already in that league."
        : "That already exists.";
    case "42501":
      return "You are not allowed to do that.";
    case "23514": {
      const m = /violates check constraint "([^"]+)"/.exec(error.message);
      return m ? `Invalid value (${m[1]}).` : error.message;
    }
    case "P0001":
      return error.message;
    default:
      return error.message || fallback;
  }
}
