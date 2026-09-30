"use client";

import { useActionState } from "react";

import { updateProfile, type ProfileActionState } from "@/app/(app)/profile/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm({ displayName, email }: { displayName: string; email: string }) {
  const [state, action] = useActionState<ProfileActionState, FormData>(updateProfile, {});
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          minLength={2}
          maxLength={32}
          required
          autoComplete="nickname"
        />
        <p className="text-muted-foreground text-xs">Shown on leaderboards and in the news feed.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} disabled readOnly />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">Save</SubmitButton>
    </form>
  );
}
