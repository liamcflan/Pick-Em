"use client";

import { useActionState } from "react";

import { updateSeason, type AdminActionState } from "@/app/(app)/admin/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SeasonForm({
  seasonId,
  regularSeasonWeeks,
  playoffsStartAtLocal,
}: {
  seasonId: string;
  regularSeasonWeeks: number;
  /** `YYYY-MM-DDTHH:MM` in Eastern, for the datetime-local input. */
  playoffsStartAtLocal: string;
}) {
  const [state, action] = useActionState<AdminActionState, FormData>(updateSeason, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-4">
      <input type="hidden" name="seasonId" value={seasonId} />
      <div className="space-y-2">
        <Label htmlFor="regularSeasonWeeks">Regular-season weeks</Label>
        <Input
          id="regularSeasonWeeks"
          name="regularSeasonWeeks"
          type="number"
          min={1}
          max={22}
          defaultValue={regularSeasonWeeks}
          className="w-28"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="playoffsStartAt">Playoffs start (ET)</Label>
        <Input
          id="playoffsStartAt"
          name="playoffsStartAt"
          type="datetime-local"
          defaultValue={playoffsStartAtLocal}
          className="w-56"
        />
      </div>
      <SubmitButton size="sm" variant="outline" pendingText="Saving…">
        Save season
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
