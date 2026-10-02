import type { Metadata } from "next";
import Link from "next/link";

import { LineForm, PullLinesForm, VoidGameForm } from "@/components/admin/line-editor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lines" };

const fmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

function spreadLabel(home: string, away: string, homeSpread: number | null): string {
  if (homeSpread === null) return "no line";
  if (homeSpread === 0) return "pick 'em";
  return homeSpread < 0 ? `${home} ${homeSpread}` : `${away} ${-homeSpread}`;
}

type LinesData = Awaited<ReturnType<typeof loadLinesData>>;

/** All time-dependent reads live here (not in the component) so rendering itself stays pure. */
async function loadLinesData(requestedWeek: number) {
  const supabase = await createClient();
  const nowMs = Date.now();

  const { data: season } = await supabase
    .from("seasons")
    .select("id, year")
    .eq("is_active", true)
    .maybeSingle();
  if (!season)
    return { season: null, weeks: [], week: null, games: [], lineByGame: new Map(), nowMs };

  const { data: weeks } = await supabase
    .from("weeks")
    .select("id, week_number, spread_lock_at, last_deadline_at")
    .eq("season_id", season.id)
    .order("week_number");
  const list = weeks ?? [];
  const current =
    list.find((w) => !w.last_deadline_at || new Date(w.last_deadline_at).getTime() > nowMs) ??
    list.at(-1);
  const week = list.find((w) => w.week_number === requestedWeek) ?? current ?? null;
  if (!week) return { season, weeks: list, week: null, games: [], lineByGame: new Map(), nowMs };

  const { data: games } = await supabase
    .from("games")
    .select(
      "id, kickoff_at, deadline_at, status, home:teams!games_home_team_id_fkey(abbreviation), away:teams!games_away_team_id_fkey(abbreviation)",
    )
    .eq("week_id", week.id)
    .order("kickoff_at");
  const { data: lines } = await supabase
    .from("lines")
    .select("game_id, home_spread, source, locked_at")
    .in(
      "game_id",
      (games ?? []).map((g) => g.id),
    )
    .eq("is_current", true);
  const lineByGame = new Map((lines ?? []).map((l) => [l.game_id, l]));
  return { season, weeks: list, week, games: games ?? [], lineByGame, nowMs };
}

export default async function AdminLinesPage({ searchParams }: PageProps<"/admin/lines">) {
  const params = await searchParams;
  const requested = typeof params.week === "string" ? Number(params.week) : NaN;
  const data: LinesData = await loadLinesData(requested);
  const { season, weeks, week, games, lineByGame, nowMs } = data;

  if (!season) {
    return (
      <p className="text-muted-foreground text-sm">No active season. Import the schedule first.</p>
    );
  }
  if (!week)
    return (
      <p className="text-muted-foreground text-sm">No weeks yet. Import the schedule first.</p>
    );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Lines · week {week.week_number}</h1>
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="Weeks">
          {weeks.map((w) => (
            <Link
              key={w.id}
              href={`/admin/lines?week=${w.week_number}`}
              className={
                w.id === week.id
                  ? "bg-primary text-primary-foreground rounded px-2 py-1"
                  : "text-muted-foreground hover:text-foreground rounded px-2 py-1"
              }
            >
              {w.week_number}
            </Link>
          ))}
        </nav>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pull consensus lines</CardTitle>
          <CardDescription>
            Scheduled for {week.spread_lock_at ? fmt.format(new Date(week.spread_lock_at)) : "—"}{" "}
            ET. Then edit any line below to match the Wednesday New York Post. Edits are versioned
            and audited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PullLinesForm week={week.week_number} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Games</CardTitle>
          <CardDescription>
            Negative home spread means the home team is favoured. Locked after each game&rsquo;s
            deadline. Void a game that will not be played: every pick on it is refunded and the week
            can settle without it.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs uppercase">
              <tr>
                <th className="py-2 pr-4">Game</th>
                <th className="py-2 pr-4">Kickoff (ET)</th>
                <th className="py-2 pr-4">Deadline (ET)</th>
                <th className="py-2 pr-4">Line</th>
                <th className="py-2 pr-4">Home spread</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {games.map((g) => {
                const line = lineByGame.get(g.id);
                const home = g.home?.abbreviation ?? "HOME";
                const away = g.away?.abbreviation ?? "AWAY";
                const locked =
                  new Date(g.deadline_at).getTime() <= nowMs ||
                  g.status === "final" ||
                  g.status === "void";
                return (
                  <tr key={g.id}>
                    <td className="py-2 pr-4 font-medium">
                      {away} @ {home}
                    </td>
                    <td className="py-2 pr-4">{fmt.format(new Date(g.kickoff_at))}</td>
                    <td className="py-2 pr-4">{fmt.format(new Date(g.deadline_at))}</td>
                    <td className="py-2 pr-4">
                      {spreadLabel(home, away, line?.home_spread ?? null)}
                      {line ? (
                        <span className="text-muted-foreground ml-2 text-xs">{line.source}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4">
                      <LineForm
                        gameId={g.id}
                        week={week.week_number}
                        current={line?.home_spread ?? null}
                        locked={locked}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs">{g.status}</span>
                        <VoidGameForm
                          gameId={g.id}
                          week={week.week_number}
                          disabled={g.status === "void" || g.status === "final"}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
