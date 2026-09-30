import Link from "next/link";

import { ResultBadge } from "@/components/picks/pick-row";
import { Button } from "@/components/ui/button";

export type ThisWeekPick = {
  id: string;
  leagueId: string;
  leagueName: string;
  matchup: string;
  team: string;
  units: number;
  status: string;
  placedBy: "member" | "system";
  score: string | null;
};

export type ThisWeekLeague = {
  id: string;
  name: string;
  status: "none" | "bye" | "eliminated" | "picked" | "complete";
  picks: ThisWeekPick[];
};

/** The signed-in member's picks this week, grouped by league. Pure. */
export function ThisWeek({
  weekNumber,
  leagues,
}: {
  weekNumber: number;
  leagues: ThisWeekLeague[];
}) {
  if (!leagues.length)
    return <p className="text-muted-foreground text-sm">Join a league to start picking.</p>;
  return (
    <ul className="space-y-3 text-sm" data-testid="this-week">
      {leagues.map((l) => (
        <li key={l.id} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/leagues/${l.id}/picks`} className="font-medium hover:underline">
              {l.name}
            </Link>
            {l.status === "none" ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/leagues/${l.id}/picks`}>Pick week {weekNumber}</Link>
              </Button>
            ) : null}
          </div>
          {l.status === "bye" ? (
            <p className="text-muted-foreground">On bye this week.</p>
          ) : l.status === "eliminated" ? (
            <p className="text-destructive">Busted out.</p>
          ) : l.status === "complete" ? (
            <p className="text-muted-foreground">Season complete.</p>
          ) : l.status === "none" ? (
            <p className="text-muted-foreground">
              No picks yet. At least 1k is due before the last deadline.
            </p>
          ) : (
            <ul className="divide-y">
              {l.picks.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-1">
                  <span>
                    {p.units}k on {p.team}
                    <span className="text-muted-foreground ml-2 text-xs">{p.matchup}</span>
                  </span>
                  <span className="text-right whitespace-nowrap">
                    {p.score ? (
                      <span className="text-muted-foreground text-xs">{p.score}</span>
                    ) : null}
                    <ResultBadge status={p.status} placedBy={p.placedBy} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
