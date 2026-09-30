"use client";

import { useActionState } from "react";

import { pullLines, setLine, type LinesActionState } from "@/app/(app)/admin/lines/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";

export function LineForm({
  gameId,
  week,
  current,
  locked,
}: {
  gameId: string;
  week: number;
  current: number | null;
  locked: boolean;
}) {
  const [state, action] = useActionState<LinesActionState, FormData>(setLine, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="week" value={week} />
      <Input
        name="homeSpread"
        type="number"
        step={0.5}
        min={-60}
        max={60}
        defaultValue={current ?? ""}
        placeholder="home spread"
        className="w-28"
        disabled={locked}
        aria-label="Home spread"
      />
      <SubmitButton size="sm" variant="outline" disabled={locked} pendingText="Saving…">
        Save
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function PullLinesForm({ week }: { week: number }) {
  const [state, action] = useActionState<LinesActionState, FormData>(pullLines, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="week" value={week} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="force" className="size-4 accent-current" />
        Overwrite existing lines
      </label>
      <SubmitButton size="sm" pendingText="Pulling…">
        Pull lines from ESPN now
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
