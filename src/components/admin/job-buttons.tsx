"use client";

import { useActionState } from "react";

import { runSettlementJob, type AdminActionState } from "@/app/(app)/admin/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

export function SettlementButtons() {
  const [finals, finalsAction] = useActionState<AdminActionState, FormData>(runSettlementJob, {});
  const [check, checkAction] = useActionState<AdminActionState, FormData>(runSettlementJob, {});
  return (
    <div className="space-y-4">
      <form action={finalsAction} className="space-y-2">
        <input type="hidden" name="job" value="sync_finals" />
        <SubmitButton size="sm" pendingText="Settling…">
          Refresh scores and settle
        </SubmitButton>
        <p className="text-muted-foreground text-xs">
          Grades finished games now instead of waiting for the hourly run. Safe to repeat.
        </p>
        <FormMessage state={finals} />
      </form>
      <form action={checkAction} className="space-y-2">
        <input type="hidden" name="job" value="weekly_action_check" />
        <SubmitButton size="sm" variant="outline" pendingText="Checking…">
          Run bye / forced-pick check
        </SubmitButton>
        <p className="text-muted-foreground text-xs">
          For weeks past their last deadline: members with no pick get their bye or 1k on the
          underdog of the last game.
        </p>
        <FormMessage state={check} />
      </form>
    </div>
  );
}
