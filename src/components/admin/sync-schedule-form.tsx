"use client";

import { useActionState } from "react";

import { syncSchedule, type AdminActionState } from "@/app/(app)/admin/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SyncScheduleForm({ defaultYear }: { defaultYear: number }) {
  const [state, action] = useActionState<AdminActionState, FormData>(syncSchedule, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="year">Season</Label>
          <Input
            id="year"
            name="year"
            type="number"
            defaultValue={defaultYear}
            min={2020}
            max={2100}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="weeks">Weeks (optional)</Label>
          <Input id="weeks" name="weeks" placeholder="e.g. 5, 6 — blank for all 18" />
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Syncing… (up to a minute)">Sync schedule</SubmitButton>
    </form>
  );
}
