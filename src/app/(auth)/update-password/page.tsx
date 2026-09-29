import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/supabase/server";

import { UpdatePasswordForm } from "./update-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function UpdatePasswordPage() {
  // The reset link signs the user in via /auth/callback before landing here.
  const user = await getUser();
  if (!user) redirect("/sign-in?error=link");
  return <UpdatePasswordForm />;
}
