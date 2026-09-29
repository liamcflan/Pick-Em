import type { NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";
import { buildCsp, generateNonce, staticSecurityHeaders } from "@/lib/security/headers";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    isDev: process.env.NODE_ENV === "development",
    isVercelPreview: process.env.VERCEL_ENV === "preview",
  });

  // Forward the nonce and CSP to the render so Next.js tags its own scripts with the nonce.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = await updateSession(request, requestHeaders);

  response.headers.set("Content-Security-Policy", csp);
  for (const [name, value] of Object.entries(
    staticSecurityHeaders(process.env.NODE_ENV === "production"),
  )) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  // Everything except static assets, images and the Python job functions.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/jobs|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
