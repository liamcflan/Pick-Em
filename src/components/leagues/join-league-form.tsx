"use client";

import { useActionState } from "react";

import { joinLeague, type LeagueActionState } from "@/app/(app)/leagues/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function JoinLeagueForm() {
  const [state, action] = useActionState<LeagueActionState, FormData>(joinLeague, {});
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="invite-code">Invite code</Label>
        <Input
          id="invite-code"
          name="code"
          placeholder="ABCD-EFGH"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="font-mono tracking-widest uppercase"
          required
        />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Joining…" variant="outline">
        Join league
      </SubmitButton>
    </form>
  );
}
