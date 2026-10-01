import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ResultBadge } from "@/components/picks/pick-row";
import { Avatar } from "@/components/profile/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BET_UNIT_CENTS, formatMoney } from "@/lib/domain/money";
import { formatSpread, sideSpread } from "@/lib/domain/spread";
import {
  EMPTY_STATS,
  coverRate,
  formatPercent,
  formatRecord,
  roi,
  type MemberStats,
} from "@/lib/domain/stats";
import { createClient, getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pick history" };

const fmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/New_York",
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs uppercase">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default async function HistoryPage({
  params,
  searchParams,
}: PageProps<"/leagues/[id]/history">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect(`/sign-in?next=/leagues/${id}/history`);
  const supabase = await createClient();

  const { data: league } = await supabase
    .from("leagues")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!league) notFound();

  const requested = typeof sp.user === "string" ? sp.user : user.id;
  const { data: members } = await supabase
    .from("league_members")
    .select("user_id, eliminated_at, profiles(display_name, avatar_path)")
    .eq("league_id", id)
    .is("left_at", null);
  const subject = (members ?? []).find((m) => m.user_id === requested);
  if (!subject) notFound();
  const name = subject.profiles?.display_name ?? "Player";

  const [{ data: stats }, { data: picks }] = await Promise.all([
    supabase
      .from("league_member_stats")
      .select("*")
      .eq("league_id", id)
      .eq("user_id", requested)
      .maybeSingle(),
    supabase
      .from("picks")
      .select(
        "id, side, wager_cents, status, placed_by, created_at, lines(home_spread), weeks(week_number), games(kickoff_at, status, home_score, away_score, home:teams!games_home_team_id_fkey(abbreviation), away:teams!games_away_team_id_fkey(abbreviation))",
      )
      .eq("league_id", id)
      .eq("user_id", requested)
      .order("created_at", { ascending: false }),
  ]);
  const s: MemberStats = (stats as MemberStats | null) ?? EMPTY_STATS;
  const mine = requested === user.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={name} path={subject.profiles?.avatar_path} size="md" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {mine ? "My picks" : `${name}'s picks`}
            </h1>
            <p className="text-muted-foreground text-sm">
              <Link href={`/leagues/${league.id}`} className="hover:underline">
                {league.name}
              </Link>
              {subject.eliminated_at ? " · busted" : ""}
            </p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-1 text-sm">
          {(members ?? []).map((m) => (
            <Link
              key={m.user_id}
              href={`/leagues/${league.id}/history?user=${m.user_id}`}
              className={
                m.user_id === requested
                  ? "bg-primary text-primary-foreground rounded px-2 py-1"
                  : "text-muted-foreground hover:text-foreground rounded px-2 py-1"
              }
            >
              {m.profiles?.display_name ?? "Player"}
            </Link>
          ))}
        </nav>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Season so far</CardTitle>
          <CardDescription>
            Against the spread; a push counts as a loss. Voided games are excluded.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-8" data-testid="member-stats">
          <Stat label="Record" value={formatRecord(s)} />
          <Stat label="Cover rate" value={formatPercent(coverRate(s))} />
          <Stat label="Net" value={formatMoney(s.net_cents)} />
          <Stat label="ROI" value={formatPercent(roi(s))} />
          <Stat label="Biggest win" value={formatMoney(s.biggest_win_cents)} />
          {s.forced_picks ? <Stat label="Forced picks" value={String(s.forced_picks)} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Every pick</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {picks && picks.length ? (
            <table className="w-full text-sm" data-testid="pick-history">
              <thead className="text-muted-foreground text-left text-xs uppercase">
                <tr>
                  <th className="py-2 pr-4">Week</th>
                  <th className="py-2 pr-4">Game</th>
                  <th className="py-2 pr-4">Pick</th>
                  <th className="py-2 pr-4">Bet</th>
                  <th className="py-2 pr-4">Score</th>
                  <th className="py-2 pr-4">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {picks.map((p) => {
                  const g = p.games;
                  const home = g?.home?.abbreviation ?? "HOME";
                  const away = g?.away?.abbreviation ?? "AWAY";
                  const team = p.side === "home" ? home : away;
                  const spread =
                    p.lines?.home_spread !== null && p.lines?.home_spread !== undefined
                      ? formatSpread(sideSpread(p.lines.home_spread, p.side))
                      : "";
                  return (
                    <tr key={p.id}>
                      <td className="py-2 pr-4 tabular-nums">{p.weeks?.week_number ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {away} @ {home}
                        {g?.kickoff_at ? (
                          <span className="text-muted-foreground ml-2 text-xs">
                            {fmt.format(new Date(g.kickoff_at))}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4 font-medium">
                        {team} {spread}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">
                        {Math.round(p.wager_cents / BET_UNIT_CENTS)}k
                      </td>
                      <td className="py-2 pr-4 tabular-nums">
                        {g &&
                        g.home_score !== null &&
                        g.away_score !== null &&
                        g.status !== "scheduled"
                          ? `${away} ${g.away_score} – ${home} ${g.home_score}`
                          : "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <ResultBadge status={p.status} placedBy={p.placed_by} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-muted-foreground text-sm">No picks yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
