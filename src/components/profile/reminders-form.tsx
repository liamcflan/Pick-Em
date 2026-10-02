"use client";

import { useActionState } from "react";

import { updateReminders, type ProfileActionState } from "@/app/(app)/profile/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

export function RemindersForm({ enabled }: { enabled: boolean }) {
  const [state, action] = useActionState<ProfileActionState, FormData>(updateReminders, {});
  return (
    <form action={action} className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="reminders"
          defaultChecked={enabled}
          className="mt-0.5 size-4 accent-current"
        />
        <span>
          Email me when a week&rsquo;s picks lock in a couple of hours and I have nothing in.
          <span className="text-muted-foreground block text-xs">
            One email per league per week, only when it matters.
          </span>
        </span>
      </label>
      <FormMessage state={state} />
      <SubmitButton size="sm" variant="outline" pendingText="Saving…">
        Save reminders
      </SubmitButton>
    </form>
  );
}
