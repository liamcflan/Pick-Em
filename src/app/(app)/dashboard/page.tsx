import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { rankRows } from "@/lib/domain/leaderboard";
import { NewsFeed, type FeedItem } from "@/components/leagues/news-feed";
import { LiveRefresher } from "@/components/live/live-refresher";
import { ThisWeek, type ThisWeekLeague } from "@/components/picks/this-week";
import { InstallHint } from "@/components/pwa/install-hint";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { anyGameLive } from "@/lib/domain/live";
import { BET_UNIT_CENTS, formatMoney } from "@/lib/domain/money";
import { coverLabel, coverProbability, fractionRemaining } from "@/lib/domain/probability";
import { createClient, getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

type MemberRow = {
  league_id: string;
  eliminated_at: string | null;
  bye_week_id: string | null;
};
type LeagueRow = { id: string; name: string; status: "open" | "locked" | "complete" };

/** Current week + my picks in it. Time-dependent, so it lives outside the component. */
async function loadThisWeek(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  leagues: LeagueRow[],
  myMemberships: MemberRow[],
) {
  const nowMs = Date.now();
  const { data: season } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();
  if (!season) return null;
  const { data: weeks } = await supabase
    .from("weeks")
    .select("id, week_number, last_deadline_at")
    .eq("season_id", season.id)
    .order("week_number");
  const list = weeks ?? [];
  const week =
    list.find((w) => !w.last_deadline_at || new Date(w.last_deadline_at).getTime() > nowMs) ??
    list.at(-1);
  if (!week) return null;

  const { data: picks } = await supabase
    .from("picks")
    .select(
      "id, league_id, side, wager_cents, status, placed_by, lines(home_spread), games(status, kickoff_at, home_score, away_score, period, clock, home:teams!games_home_team_id_fkey(abbreviation), away:teams!games_away_team_id_fkey(abbreviation))",
    )
    .eq("user_id", userId)
    .eq("week_id", week.id)
    .order("created_at");

  const byLeague: ThisWeekLeague[] = leagues.map((l) => {
    const m = myMemberships.find((x) => x.league_id === l.id);
    const mine = (picks ?? [])
      .filter((p) => p.league_id === l.id)
      .map((p) => {
        const home = p.games?.home?.abbreviation ?? "HOME";
        const away = p.games?.away?.abbreviation ?? "AWAY";
        const g = p.games;
        return {
          id: p.id,
          leagueId: l.id,
          leagueName: l.name,
          matchup: `${away} @ ${home}`,
          team: p.side === "home" ? home : away,
          units: Math.round(p.wager_cents / BET_UNIT_CENTS),
          status: p.status,
          placedBy: p.placed_by,
          score:
            g && g.status !== "scheduled" && g.home_score !== null && g.away_score !== null
              ? `${g.status === "final" ? "Final" : "Live"} ${away} ${g.away_score}–${home} ${g.home_score}`
              : null,
          cover:
            g &&
            g.status === "in_progress" &&
            g.home_score !== null &&
            g.away_score !== null &&
            p.lines?.home_spread !== undefined &&
            p.lines?.home_spread !== null
              ? coverLabel(
                  coverProbability({
                    homeScore: g.home_score,
                    awayScore: g.away_score,
                    homeSpread: p.lines.home_spread,
                    side: p.side,
                    fractionRemaining: fractionRemaining(g.status, g.period, g.clock),
                  }),
                )
              : null,
        };
      });
    const status: ThisWeekLeague["status"] = m?.eliminated_at
      ? "eliminated"
      : l.status === "complete"
        ? "complete"
        : m?.bye_week_id === week.id
          ? "bye"
          : mine.length
            ? "picked"
            : "none";
    return { id: l.id, name: l.name, status, picks: mine };
  });
  const live = anyGameLive(
    (picks ?? []).flatMap((p) => (p.games ? [p.games] : [])),
    nowMs,
  );
  return { weekId: week.id, weekNumber: week.week_number, leagues: byLeague, live };
}

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/dashboard");
  const supabase = await createClient();

  const [{ data: members }, { data: balances }, { data: events }, { data: leagues }] =
    await Promise.all([
      supabase
        .from("league_members")
        .select("league_id, user_id, role, eliminated_at, bye_week_id, profiles(display_name)")
        .is("left_at", null),
      supabase
        .from("league_balances")
        .select("league_id, user_id, balance_cents, total_risked_cents"),
      supabase
        .from("league_events")
        .select("id, league_id, kind, actor_user_id, subject_user_id, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(12),
      supabase.from("leagues").select("id, name, status"),
    ]);

  // Site admins can read every league (support); the dashboard only shows the ones I am in.
  const myMemberships = (members ?? []).filter((m) => m.user_id === user.id);
  const leaguesImIn = (leagues ?? []).filter((l) =>
    myMemberships.some((m) => m.league_id === l.id),
  );

  const thisWeek = await loadThisWeek(supabase, user.id, leaguesImIn, myMemberships);

  const leagueName = new Map((leagues ?? []).map((l) => [l.id, l.name]));
  const names: Record<string, string> = {};
  for (const m of members ?? []) names[m.user_id] = m.profiles?.display_name ?? "Player";

  // My standing in each league I belong to.
  const myLeagues = leaguesImIn.map((l) => {
    const rows = (members ?? [])
      .filter((m) => m.league_id === l.id)
      .map((m) => {
        const b = (balances ?? []).find((x) => x.league_id === l.id && x.user_id === m.user_id);
        return {
          userId: m.user_id,
          displayName: names[m.user_id] ?? "Player",
          balanceCents: b?.balance_cents ?? 0,
          totalRiskedCents: b?.total_risked_cents ?? 0,
          role: m.role,
          eliminatedAt: m.eliminated_at,
        };
      });
    const ranked = rankRows(rows);
    const mine = ranked.find((r) => r.userId === user.id);
    return {
      id: l.id,
      name: l.name,
      players: rows.length,
      rank: mine?.rank ?? null,
      balance: mine?.balanceCents ?? 0,
    };
  });

  const feed: FeedItem[] = (events ?? []).map((e) => ({
    ...e,
    leagueName: leagueName.get(e.league_id),
  }));

  return (
    <div className="space-y-6">
      {thisWeek?.live ? <LiveRefresher weekId={thisWeek.weekId} /> : null}
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <InstallHint />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My leagues</CardTitle>
            <CardDescription>Where you stand in each one.</CardDescription>
          </CardHeader>
          <CardContent>
            {myLeagues.length ? (
              <ul className="divide-y text-sm" data-testid="dashboard-leagues">
                {myLeagues.map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-2">
                    <Link href={`/leagues/${l.id}`} className="font-medium hover:underline">
                      {l.name}
                    </Link>
                    <span className="text-muted-foreground tabular-nums">
                      {l.rank ? `#${l.rank} of ${l.players}` : ""} · {formatMoney(l.balance)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">You are not in a league yet.</p>
                <Button asChild size="sm">
                  <Link href="/leagues">Create or join a league</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{thisWeek ? `Week ${thisWeek.weekNumber}` : "This week"}</CardTitle>
            <CardDescription>Your picks in every league and how they are doing.</CardDescription>
          </CardHeader>
          <CardContent>
            {thisWeek ? (
              <ThisWeek weekNumber={thisWeek.weekNumber} leagues={thisWeek.leagues} />
            ) : (
              <p className="text-muted-foreground text-sm">
                The season has not started yet. Picks open once lines are locked on Wednesday.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>News</CardTitle>
          <CardDescription>Across all your leagues.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewsFeed items={feed} names={names} />
        </CardContent>
      </Card>
    </div>
  );
}
