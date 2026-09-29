"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { REMEMBER_COOKIE, applyPersistence, shouldPersist } from "@/lib/supabase/remember";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];
  return match === undefined ? undefined : decodeURIComponent(match);
}

function serializeCookie(name: string, value: string, attrs: Record<string, unknown>): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (typeof attrs.maxAge === "number") parts.push(`Max-Age=${attrs.maxAge}`);
  if (attrs.expires instanceof Date) parts.push(`Expires=${attrs.expires.toUTCString()}`);
  if (attrs.path) parts.push(`Path=${attrs.path}`);
  if (attrs.domain) parts.push(`Domain=${attrs.domain}`);
  if (attrs.sameSite) parts.push(`SameSite=${attrs.sameSite}`);
  if (attrs.secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Browser-side Supabase client (for Realtime subscriptions and client-only reads later on).
 * Honours the same remember-me preference as the server client.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          if (typeof document === "undefined") return [];
          return document.cookie
            .split("; ")
            .filter(Boolean)
            .map((row) => {
              const [name, ...rest] = row.split("=");
              return { name, value: decodeURIComponent(rest.join("=")) };
            });
        },
        setAll(cookiesToSet) {
          const persist = shouldPersist(readCookie(REMEMBER_COOKIE));
          cookiesToSet.forEach(({ name, value, options }) => {
            document.cookie = serializeCookie(name, value, applyPersistence(options, persist));
          });
        },
      },
    },
  );
}
