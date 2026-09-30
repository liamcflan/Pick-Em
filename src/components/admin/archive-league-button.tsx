"use client";

import { useActionState } from "react";

import { archiveLeague, type AdminActionState } from "@/app/(app)/admin/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

export function ArchiveLeagueButton({
  leagueId,
  archived,
}: {
  leagueId: string;
  archived: boolean;
}) {
  const [state, action] = useActionState<AdminActionState, FormData>(archiveLeague, {});
  return (
    <form
      action={action}
      className="flex items-center gap-2"
      onSubmit={(e) => {
        const msg = archived
          ? "Restore this league for its members?"
          : "Archive this league? Members stop seeing it and no picks can be made until it is restored.";
        if (!window.confirm(msg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="archived" value={archived ? "false" : "true"} />
      <SubmitButton size="sm" variant={archived ? "outline" : "ghost"} pendingText="Saving…">
        {archived ? "Restore" : "Archive"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
