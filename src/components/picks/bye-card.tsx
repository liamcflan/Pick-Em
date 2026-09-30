"use client";

import { useActionState } from "react";

import { toggleBye, type PickActionState } from "@/app/(app)/leagues/[id]/picks/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ByeCard({
  leagueId,
  weekId,
  weekNumber,
  byeState,
  weekClosed,
  hasPicks,
}: {
  leagueId: string;
  weekId: string;
  weekNumber: number;
  byeState: "available" | "this-week" | "used-elsewhere";
  weekClosed: boolean;
  hasPicks: boolean;
}) {
  const [state, action] = useActionState<PickActionState, FormData>(toggleBye, {});
  if (weekNumber > 13 && byeState !== "this-week") return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bye week</CardTitle>
        <CardDescription>
          {byeState === "used-elsewhere"
            ? "You have already used your bye this season."
            : byeState === "this-week"
              ? `You are on a bye for week ${weekNumber}. No bets required.`
              : "One per season, usable through week 13. Skip a week without betting. If you make no bets and have not taken it, it is used automatically."}
        </CardDescription>
      </CardHeader>
      {byeState !== "used-elsewhere" && !weekClosed ? (
        <CardContent>
          <form action={action} className="flex items-center gap-3">
            <input type="hidden" name="leagueId" value={leagueId} />
            <input type="hidden" name="weekId" value={weekId} />
            <input
              type="hidden"
              name="action"
              value={byeState === "this-week" ? "cancel" : "take"}
            />
            <SubmitButton
              size="sm"
              variant="outline"
              disabled={byeState === "available" && hasPicks}
              pendingText="Saving…"
            >
              {byeState === "this-week" ? "Cancel bye" : "Take my bye this week"}
            </SubmitButton>
            {byeState === "available" && hasPicks ? (
              <span className="text-muted-foreground text-xs">Remove your bets first.</span>
            ) : null}
            <FormMessage state={state} />
          </form>
        </CardContent>
      ) : null}
    </Card>
  );
}
