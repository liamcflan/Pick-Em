import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";
import { REMEMBER_COOKIE, applyPersistence, shouldPersist } from "@/lib/supabase/remember";

const PROTECTED_PREFIXES = ["/dashboard", "/leagues", "/profile", "/admin"];
const AUTH_ONLY_PATHS = ["/sign-in", "/sign-up", "/forgot-password"];

/**
 * Refresh the Supabase session cookie on every request and apply optimistic redirects.
 * Reads the JWT only (no database calls) — real authorization happens in RLS and server code.
 */
export async function updateSession(request: NextRequest, requestHeaders: Headers) {
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: { secure: process.env.NODE_ENV === "production" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          const persist = shouldPersist(request.cookies.get(REMEMBER_COOKIE)?.value);
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, applyPersistence(options, persist)),
          );
        },
      },
    },
  );

  // Must run before any redirect decision so a refreshed token is written back to the response.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAuthOnly = AUTH_ONLY_PATHS.includes(pathname);

  if (!signedIn && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (signedIn && isAuthOnly) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
