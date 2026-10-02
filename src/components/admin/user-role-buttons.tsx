"use client";

import { useActionState } from "react";

import { setLeagueRole, setSiteAdmin, type AdminActionState } from "@/app/(app)/admin/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

export function SiteAdminButton({
  userId,
  name,
  isAdmin,
  isSelf,
}: {
  userId: string;
  name: string;
  isAdmin: boolean;
  isSelf: boolean;
}) {
  const [state, action] = useActionState<AdminActionState, FormData>(setSiteAdmin, {});
  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        const msg = isAdmin
          ? isSelf
            ? "Remove your own site admin access? You will lose the admin pages immediately."
            : `Remove site admin from ${name}?`
          : `Make ${name} a site admin? They will be able to edit lines, settle games and manage every user.`;
        if (!window.confirm(msg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="isAdmin" value={isAdmin ? "false" : "true"} />
      <SubmitButton size="sm" variant={isAdmin ? "ghost" : "outline"} pendingText="Saving…">
        {isAdmin ? "Remove admin" : "Make admin"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function LeagueRoleButton({
  leagueId,
  userId,
  role,
}: {
  leagueId: string;
  userId: string;
  role: "member" | "commissioner";
}) {
  const [state, action] = useActionState<AdminActionState, FormData>(setLeagueRole, {});
  const next = role === "commissioner" ? "member" : "commissioner";
  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={next} />
      <SubmitButton size="sm" variant="ghost" pendingText="Saving…">
        {role === "commissioner" ? "Make member" : "Make commissioner"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
