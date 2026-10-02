"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  firstIssue,
  forgotPasswordSchema,
  safeNext,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "@/lib/auth/validation";
import { publicEnv } from "@/lib/env";
import { errorFields, log } from "@/lib/log";
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE } from "@/lib/supabase/remember";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; success?: string };

async function appOrigin(): Promise<string> {
  if (publicEnv.NEXT_PUBLIC_APP_URL) return publicEnv.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

async function setRememberCookie(remember: boolean) {
  const store = await cookies();
  store.set(REMEMBER_COOKIE, remember ? "1" : "0", {
    path: "/",
    sameSite: "lax",
    httpOnly: false, // the browser client reads it too
    secure: process.env.NODE_ENV === "production",
    maxAge: REMEMBER_MAX_AGE,
  });
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    remember: formData.get("remember") === "on",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await setRememberCookie(parsed.data.remember);
  const supabase = await createClient({ remember: parsed.data.remember });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    log.warn("sign-in failed", { reason: error.code ?? error.message });
    return { error: "Incorrect email or password." };
  }
  log.info("sign-in", { user_id: data.user?.id, remember: parsed.data.remember });
  redirect(safeNext(formData.get("next")?.toString()));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  await setRememberCookie(true);
  const supabase = await createClient({ remember: true });
  const origin = await appOrigin();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
    },
  });
  if (error) {
    log.warn("sign-up failed", { reason: error.code ?? error.message });
    return { error: error.message };
  }
  log.info("sign-up", { user_id: data.user?.id, confirmed: Boolean(data.session) });
  if (!data.session) {
    return { success: "Check your email to confirm your account, then sign in." };
  }
  redirect("/dashboard");
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  await setRememberCookie(true);
  const supabase = await createClient({ remember: true });
  const origin = await appOrigin();
  const next = safeNext(formData.get("next")?.toString());
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) {
    log.error("google sign-in init failed", errorFields(error));
    redirect("/sign-in?error=google");
  }
  redirect(data.url);
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const origin = await appOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/update-password`,
  });
  if (error) log.warn("password reset request failed", { reason: error.code ?? error.message });
  // Always the same message so the form cannot be used to probe which emails exist.
  return { success: "If that email has an account, a reset link is on its way." };
}

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = updatePasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    log.warn("password update failed", { reason: error.code ?? error.message });
    return { error: error.message };
  }
  log.info("password updated", { user_id: data.user.id });
  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.auth.signOut();
  log.info("sign-out", { user_id: user?.id });
  redirect("/sign-in");
}
