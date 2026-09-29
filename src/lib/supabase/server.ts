import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { REMEMBER_COOKIE, applyPersistence, shouldPersist } from "@/lib/supabase/remember";

type Options = {
  /** Override the persisted preference (used by the sign-in action before the cookie exists). */
  remember?: boolean;
};

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Runs as the signed-in user (anon key + user JWT), so Postgres RLS is enforced on every query.
 * Create one per request; never cache across requests.
 */
export async function createClient(options: Options = {}) {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: { secure: process.env.NODE_ENV === "production" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          const persist =
            options.remember ?? shouldPersist(cookieStore.get(REMEMBER_COOKIE)?.value);
          try {
            cookiesToSet.forEach(({ name, value, options: attrs }) =>
              cookieStore.set(name, value, applyPersistence(attrs, persist)),
            );
          } catch {
            // Called from a Server Component: cookies are read-only there. The proxy refreshes
            // sessions on every request, so a missed write here is harmless.
          }
        },
      },
    },
  );
}

/** The signed-in user for this request, verified against Supabase Auth. Memoized per request. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
