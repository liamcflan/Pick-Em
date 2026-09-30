"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import {
  deletePick,
  placePick,
  type PickActionState,
} from "@/app/(app)/leagues/[id]/picks/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { formatSpread, sideSpread } from "@/lib/domain/spread";
import { cn } from "@/lib/utils";

export type PickRowGame = {
  id: string;
  week: number;
  kickoffLabel: string;
  deadlineLabel: string;
  home: { abbreviation: string; name: string };
  away: { abbreviation: string; name: string };
  homeSpread: number | null;
  locked: boolean;
  status: string;
  score: string | null;
};

export type PickRowPick = {
  id: string;
  side: "home" | "away";
  units: number;
  status: string;
  placedBy: "member" | "system";
} | null;

const RESULT_LABEL: Record<string, { label: string; className: string }> = {
  open: { label: "locked in", className: "text-muted-foreground" },
  won: { label: "won", className: "text-emerald-700 dark:text-emerald-400" },
  lost: { label: "lost", className: "text-destructive" },
  push: { label: "push (loss)", className: "text-destructive" },
  void: { label: "void, refunded", className: "text-muted-foreground" },
};

export function ResultBadge({
  status,
  placedBy,
}: {
  status: string;
  placedBy: "member" | "system";
}) {
  const r = RESULT_LABEL[status] ?? { label: status, className: "text-muted-foreground" };
  return (
    <span className={cn("ml-2 text-xs font-medium", r.className)} data-testid="pick-result">
      {placedBy === "system" ? "auto-placed · " : ""}
      {r.label}
    </span>
  );
}

export function PickRow({
  leagueId,
  game,
  pick,
  availableUnits,
  onBye,
}: {
  leagueId: string;
  game: PickRowGame;
  pick: PickRowPick;
  availableUnits: number;
  onBye: boolean;
}) {
  const [side, setSide] = useState<"home" | "away" | null>(pick?.side ?? null);
  const [units, setUnits] = useState<number>(pick?.units ?? 1);
  const [state, action] = useActionState<PickActionState, FormData>(placePick, {});
  const [delState, delAction] = useActionState<PickActionState, FormData>(deletePick, {});

  const maxUnits = availableUnits + (pick?.units ?? 0);
  const canBet = !game.locked && game.homeSpread !== null && !onBye && game.status === "scheduled";
  const dirty = pick ? pick.side !== side || pick.units !== units : side !== null;

  const sideButton = (which: "home" | "away") => {
    const team = which === "home" ? game.home : game.away;
    const spread = game.homeSpread === null ? null : sideSpread(game.homeSpread, which);
    const selected = side === which;
    return (
      <button
        type="button"
        disabled={!canBet}
        onClick={() => setSide(which)}
        aria-pressed={selected}
        className={cn(
          "flex flex-1 flex-col items-center rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-60",
          selected ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
        )}
      >
        <span className="font-semibold">{team.abbreviation}</span>
        <span className={cn("text-xs", selected ? "opacity-90" : "text-muted-foreground")}>
          {spread === null ? "no line" : formatSpread(spread)}
        </span>
      </button>
    );
  };

  return (
    <li className="space-y-3 py-4" data-testid={`game-${game.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="font-medium">
          {game.away.name} <span className="text-muted-foreground">at</span> {game.home.name}
        </div>
        <div className="text-muted-foreground text-xs">
          {game.score
            ? `${game.status === "final" ? "Final" : "Live"} · ${game.score}`
            : game.kickoffLabel}
          {" · "}
          {game.locked ? "locked" : `picks close ${game.deadlineLabel}`}
        </div>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="leagueId" value={leagueId} />
        <input type="hidden" name="gameId" value={game.id} />
        <input type="hidden" name="week" value={game.week} />
        <input type="hidden" name="side" value={side ?? ""} />
        <input type="hidden" name="units" value={units} />

        <div className="flex gap-2">
          {sideButton("away")}
          {sideButton("home")}
        </div>

        {canBet ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-md border">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setUnits((u) => Math.max(1, u - 1))}
                aria-label="Bet less"
              >
                <Minus />
              </Button>
              <span
                className="w-14 text-center text-sm font-medium tabular-nums"
                aria-live="polite"
              >
                {units}k
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setUnits((u) => Math.min(Math.max(1, maxUnits), u + 1))}
                aria-label="Bet more"
              >
                <Plus />
              </Button>
            </div>
            <SubmitButton
              size="sm"
              disabled={!side || !dirty || units > maxUnits}
              pendingText="Saving…"
            >
              {pick ? "Update" : "Place bet"}
            </SubmitButton>
            {pick ? (
              <span className="text-muted-foreground text-xs">
                {pick.placedBy === "system" ? "auto-placed · " : ""}
                {pick.units}k on{" "}
                {pick.side === "home" ? game.home.abbreviation : game.away.abbreviation}
              </span>
            ) : null}
            <FormMessage state={state} />
          </div>
        ) : pick ? (
          <p className="text-sm">
            {pick.units}k on{" "}
            {pick.side === "home" ? game.home.abbreviation : game.away.abbreviation}
            <ResultBadge status={pick.status} placedBy={pick.placedBy} />
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            {onBye ? "On bye" : game.homeSpread === null ? "Waiting for the line" : "No bet"}
          </p>
        )}
      </form>

      {pick && canBet ? (
        <form action={delAction} className="flex items-center gap-2">
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="pickId" value={pick.id} />
          <SubmitButton size="sm" variant="ghost" pendingText="Removing…">
            <Trash2 />
            Remove bet
          </SubmitButton>
          <FormMessage state={delState} />
        </form>
      ) : null}
    </li>
  );
}
