import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/auth/validation";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

/**
 * Completes OAuth (Google) sign-in and email links (confirmation, password reset).
 * Supabase redirects here with either `code` (PKCE) or `token_hash` + `type` (OTP links).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    log.warn("auth callback: code exchange failed", { reason: error.code ?? error.message });
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    log.warn("auth callback: otp verify failed", { reason: error.code ?? error.message });
  } else {
    log.warn("auth callback: missing code and token_hash");
  }

  return NextResponse.redirect(`${origin}/sign-in?error=link`);
}
