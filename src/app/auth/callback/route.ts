import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { safeNext } from "@/lib/auth/validation";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

/**
 * Completes OAuth (Google) sign-in and email links (confirmation, password reset).
 * Supabase redirects here with either `code` (PKCE) or `token_hash` + `type` (OTP links).
 */
const OTP_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const satisfies readonly EmailOtpType[];

const paramsSchema = z.object({
  code: z.string().min(1).max(512).optional(),
  token_hash: z.string().min(1).max(512).optional(),
  type: z.enum(OTP_TYPES).optional(),
  next: z.string().max(2048).optional(),
});

type CallbackParams = z.infer<typeof paramsSchema>;

/**
 * Hands the link's credential to the auth server and reports whether it accepted it. Only the
 * auth server's verdict decides what happens next; the raw query values never gate the redirect.
 */
async function establishSession(params: CallbackParams): Promise<boolean> {
  const supabase = await createClient();
  if (params.code !== undefined) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error)
      log.warn("auth callback: code exchange failed", { reason: error.code ?? error.message });
    return !error;
  }
  if (params.token_hash !== undefined && params.type !== undefined) {
    const { error } = await supabase.auth.verifyOtp({
      type: params.type,
      token_hash: params.token_hash,
    });
    if (error)
      log.warn("auth callback: otp verify failed", { reason: error.code ?? error.message });
    return !error;
  }
  log.warn("auth callback: missing code and token_hash");
  return false;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const parsed = paramsSchema.safeParse(Object.fromEntries(searchParams));
  const params: CallbackParams = parsed.success ? parsed.data : {};

  const signedIn = await establishSession(params);
  if (signedIn) return NextResponse.redirect(`${origin}${safeNext(params.next)}`);
  return NextResponse.redirect(`${origin}/sign-in?error=link`);
}
