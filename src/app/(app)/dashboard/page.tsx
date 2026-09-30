import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { rankRows } from "@/components/leagues/leaderboard";
import { NewsFeed, type FeedItem } from "@/components/leagues/news-feed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/domain/money";
import { createClient, getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/dashboard");
  const supabase = await createClient();

  const [{ data: members }, { data: balances }, { data: events }, { data: leagues }] =
    await Promise.all([
      supabase
        .from("league_members")
        .select("league_id, user_id, role, eliminated_at, profiles(display_name)")
        .is("left_at", null),
      supabase
        .from("league_balances")
        .select("league_id, user_id, balance_cents, total_risked_cents"),
      supabase
        .from("league_events")
        .select("id, league_id, kind, actor_user_id, subject_user_id, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(12),
      supabase.from("leagues").select("id, name"),
    ]);

  const leagueName = new Map((leagues ?? []).map((l) => [l.id, l.name]));
  const names: Record<string, string> = {};
  for (const m of members ?? []) names[m.user_id] = m.profiles?.display_name ?? "Player";

  // My standing in each league I belong to.
  const myLeagues = (leagues ?? []).map((l) => {
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
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
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
            <CardTitle>This week</CardTitle>
            <CardDescription>Your picks and their live status.</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Picks open once lines are locked on Wednesday.
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
