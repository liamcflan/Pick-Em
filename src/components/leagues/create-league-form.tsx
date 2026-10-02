"use client";

import { useActionState } from "react";

import { createLeague, type LeagueActionState } from "@/app/(app)/leagues/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateLeagueForm({ defaultBalance }: { defaultBalance: number }) {
  const [state, action] = useActionState<LeagueActionState, FormData>(createLeague, {});
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="league-name">League name</Label>
        <Input
          id="league-name"
          name="name"
          minLength={2}
          maxLength={48}
          required
          placeholder="Sunday Degens"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="league-balance">Starting balance (dollars)</Label>
        <Input
          id="league-balance"
          name="balance"
          type="number"
          step={1000}
          min={1000}
          defaultValue={defaultBalance}
        />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Creating…">Create league</SubmitButton>
    </form>
  );
}
