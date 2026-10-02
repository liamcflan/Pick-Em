import type { Metadata } from "next";

import { safeNext } from "@/lib/auth/validation";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  google: "Google sign-in could not be started. Try again.",
  link: "That link is invalid or has expired. Request a new one.",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : undefined);
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  return <SignInForm next={next} initialError={error} />;
}
