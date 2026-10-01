import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LogoUploader } from "@/components/profile/logo-uploader";
import { PasswordForm } from "@/components/profile/password-form";
import { ProfileForm } from "@/components/profile/profile-form";
import { RemindersForm } from "@/components/profile/reminders-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient, getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/profile");
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_path, reminders_enabled")
    .eq("id", user.id)
    .single();
  const displayName = profile?.display_name ?? user.email ?? "Player";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
            <CardDescription>Your badge on every leaderboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <LogoUploader
              userId={user.id}
              displayName={displayName}
              avatarPath={profile?.avatar_path ?? null}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm displayName={displayName} email={user.email ?? ""} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Reminders</CardTitle>
            <CardDescription>So a missed deadline never costs you your bye.</CardDescription>
          </CardHeader>
          <CardContent>
            <RemindersForm enabled={profile?.reminders_enabled ?? true} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              At least 8 characters. Forgot it while signed out? Use the link on the sign-in page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
