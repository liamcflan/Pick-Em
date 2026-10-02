"use client";

import { useActionState } from "react";

import { postNote, updateLeague, type LeagueActionState } from "@/app/(app)/leagues/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LeagueSettingsForm({
  leagueId,
  name,
  startingBalanceDollars,
}: {
  leagueId: string;
  name: string;
  startingBalanceDollars: number;
}) {
  const [state, action] = useActionState<LeagueActionState, FormData>(updateLeague, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="leagueId" value={leagueId} />
      <div className="space-y-2">
        <Label htmlFor="settings-name">League name</Label>
        <Input
          id="settings-name"
          name="name"
          defaultValue={name}
          minLength={2}
          maxLength={48}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="settings-balance">Starting balance (dollars)</Label>
        <Input
          id="settings-balance"
          name="balance"
          type="number"
          step={1000}
          min={1000}
          defaultValue={startingBalanceDollars}
          required
        />
        <p className="text-muted-foreground text-xs">
          Can only change before the first bet is placed.
        </p>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…" size="sm">
        Save
      </SubmitButton>
    </form>
  );
}

export function CommissionerNoteForm({ leagueId }: { leagueId: string }) {
  const [state, action] = useActionState<LeagueActionState, FormData>(postNote, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="leagueId" value={leagueId} />
      <div className="space-y-2">
        <Label htmlFor="note-text">Post a note to the league</Label>
        <Input
          id="note-text"
          name="text"
          maxLength={500}
          placeholder="Lines are in, picks due Saturday night"
          required
        />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Posting…" size="sm" variant="outline">
        Post
      </SubmitButton>
    </form>
  );
}
