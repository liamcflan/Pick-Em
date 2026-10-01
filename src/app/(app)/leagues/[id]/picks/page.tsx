import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LiveRefresher } from "@/components/live/live-refresher";
import { ByeCard } from "@/components/picks/bye-card";
import { PickRow, type PickRowGame, type PickRowPick } from "@/components/picks/pick-row";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { anyGameLive, scoresDelayed } from "@/lib/domain/live";
import { BET_UNIT_CENTS, formatMoney } from "@/lib/domain/money";
import { createClient, getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Picks" };

const dayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: "America/New_York",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

/** All data + time-dependent flags for the picks sheet. Kept out of the component for purity. */
async function loadPicksData(leagueId: string, userId: string, requestedWeek: number) {
  const supabase = await createClient();
  const nowMs = Date.now();

  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, status, season_id")
    .eq("id", leagueId)
    .maybeSingle();
  if (!league) return null;

  const [{ data: member }, { data: weeks }] = await Promise.all([
    supabase
      .from("league_members")
      .select("bye_week_id, eliminated_at")
      .eq("league_id", leagueId)
      .eq("user_id", userId)
      .is("left_at", null)
      .maybeSingle(),
    supabase
      .from("weeks")
      .select("id, week_number, last_deadline_at, spread_lock_at")
      .eq("season_id", league.season_id)
      .order("week_number"),
  ]);
  const list = weeks ?? [];
  const current =
    list.find((w) => !w.last_deadline_at || new Date(w.last_deadline_at).getTime() > nowMs) ??
    list.at(-1);
  const week = list.find((w) => w.week_number === requestedWeek) ?? current ?? null;
  if (!week)
    return {
      league,
      member,
      weeks: list,
      week: null,
      games: [],
      picks: [],
      available: 0,
      budget: 0,
      nowMs,
      live: false,
      scoresDelayed: false,
    };

  const [{ data: games }, { data: picks }, { data: available }, { data: budget }] =
    await Promise.all([
      supabase
        .from("games")
        .select(
          "id, kickoff_at, deadline_at, status, home_score, away_score, period, clock, last_synced_at, home:teams!games_home_team_id_fkey(abbreviation, name), away:teams!games_away_team_id_fkey(abbreviation, name)",
        )
        .eq("week_id", week.id)
        .order("kickoff_at"),
      supabase
        .from("picks")
        .select("id, game_id, side, wager_cents, status, placed_by")
        .eq("league_id", leagueId)
        .eq("user_id", userId)
        .eq("week_id", week.id),
      supabase.rpc("available_cents", {
        p_league_id: leagueId,
        p_user_id: userId,
        p_week_id: week.id,
      }),
      supabase.rpc("week_budget_cents", {
        p_league_id: leagueId,
        p_user_id: userId,
        p_week_id: week.id,
      }),
    ]);
  const gameIds = (games ?? []).map((g) => g.id);
  const { data: lines } = gameIds.length
    ? await supabase
        .from("lines")
        .select("game_id, home_spread")
        .in("game_id", gameIds)
        .eq("is_current", true)
    : { data: [] as { game_id: string; home_spread: number }[] };
  const lineByGame = new Map((lines ?? []).map((l) => [l.game_id, l.home_spread]));

  const rows: PickRowGame[] = (games ?? []).map((g) => ({
    id: g.id,
    week: week.week_number,
    kickoffLabel: timeFmt.format(new Date(g.kickoff_at)),
    deadlineLabel: timeFmt.format(new Date(g.deadline_at)),
    home: { abbreviation: g.home?.abbreviation ?? "HOME", name: g.home?.name ?? "Home" },
    away: { abbreviation: g.away?.abbreviation ?? "AWAY", name: g.away?.name ?? "Away" },
    homeSpread: lineByGame.get(g.id) ?? null,
    locked: new Date(g.deadline_at).getTime() <= nowMs,
    status: g.status,
    score:
      g.home_score !== null && g.away_score !== null && g.status !== "scheduled"
        ? `${g.away?.abbreviation} ${g.away_score} – ${g.home?.abbreviation} ${g.home_score}`
        : null,
    homeScore: g.home_score,
    awayScore: g.away_score,
    period: g.period,
    clock: g.clock,
    dayLabel: dayFmt.format(new Date(g.kickoff_at)),
  })) as (PickRowGame & { dayLabel: string })[];

  return {
    league,
    member,
    weeks: list,
    week,
    games: rows as (PickRowGame & { dayLabel: string })[],
    picks: picks ?? [],
    available: available ?? 0,
    budget: budget ?? 0,
    nowMs,
    live: anyGameLive(games ?? [], nowMs),
    scoresDelayed: scoresDelayed(games ?? [], nowMs),
  };
}

export default async function PicksPage({
  params,
  searchParams,
}: PageProps<"/leagues/[id]/picks">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect(`/sign-in?next=/leagues/${id}/picks`);

  const requested = typeof sp.week === "string" ? Number(sp.week) : NaN;
  const data = await loadPicksData(id, user.id, requested);
  if (!data) notFound();
  const { league, member, weeks, week, games, picks, available, budget, nowMs, live } = data;
  const delayed = data.scoresDelayed;

  if (!member) notFound();
  if (!week) {
    return <p className="text-muted-foreground text-sm">The schedule has not been imported yet.</p>;
  }

  const pickByGame = new Map(picks.map((p) => [p.game_id, p]));
  const onBye = member.bye_week_id === week.id;
  const byeState = onBye ? "this-week" : member.bye_week_id ? "used-elsewhere" : "available";
  const weekClosed = !!week.last_deadline_at && new Date(week.last_deadline_at).getTime() <= nowMs;
  const availableUnits = Math.max(0, Math.floor(available / BET_UNIT_CENTS));

  const byDay = new Map<string, typeof games>();
  for (const g of games) byDay.set(g.dayLabel, [...(byDay.get(g.dayLabel) ?? []), g]);

  return (
    <div className="space-y-6">
      {live ? <LiveRefresher weekId={week.id} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <Link href={`/leagues/${league.id}`} className="hover:underline">
              {league.name}
            </Link>{" "}
            · week {week.week_number}
          </h1>
          <p className="text-muted-foreground text-sm">
            Bets are whole thousands. Each game locks at 11:59 PM Eastern the night before it is
            played.{" "}
            <Link href={`/leagues/${league.id}/history`} className="hover:underline">
              Pick history
            </Link>
          </p>
          {delayed ? (
            <p className="text-sm text-amber-700 dark:text-amber-400" role="status">
              Scores are delayed: the last update was more than ten minutes ago.
            </p>
          ) : null}
        </div>
        <nav className="flex flex-wrap gap-1 text-sm">
          {weeks.map((w) => (
            <Link
              key={w.id}
              href={`/leagues/${league.id}/picks?week=${w.week_number}`}
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>This week&rsquo;s budget</CardTitle>
            <CardDescription>
              What you started the week with. Winnings pay out when the week settles.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-8">
            <div>
              <div className="text-muted-foreground text-xs uppercase">Available to bet</div>
              <div className="text-2xl font-semibold tabular-nums" data-testid="available">
                {formatMoney(available)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase">Week budget</div>
              <div className="text-2xl font-semibold tabular-nums">{formatMoney(budget)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase">Bets placed</div>
              <div className="text-2xl font-semibold tabular-nums">{picks.length}</div>
            </div>
          </CardContent>
        </Card>
        <ByeCard
          leagueId={league.id}
          weekId={week.id}
          weekNumber={week.week_number}
          byeState={byeState}
          weekClosed={weekClosed}
          hasPicks={picks.length > 0}
        />
      </div>

      {member.eliminated_at ? (
        <p className="text-destructive text-sm">You have been eliminated from this league.</p>
      ) : null}

      {games.length === 0 ? (
        <p className="text-muted-foreground text-sm">No games for this week yet.</p>
      ) : (
        [...byDay.entries()].map(([day, list]) => (
          <Card key={day}>
            <CardHeader>
              <CardTitle>{day}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {list.map((g) => {
                  const p = pickByGame.get(g.id);
                  const pick: PickRowPick = p
                    ? {
                        id: p.id,
                        side: p.side,
                        units: p.wager_cents / BET_UNIT_CENTS,
                        status: p.status,
                        placedBy: p.placed_by,
                      }
                    : null;
                  return (
                    <PickRow
                      key={g.id}
                      leagueId={league.id}
                      game={g}
                      pick={pick}
                      availableUnits={availableUnits}
                      onBye={onBye || !!member.eliminated_at}
                    />
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
