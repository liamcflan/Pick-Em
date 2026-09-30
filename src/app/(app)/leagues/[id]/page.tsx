import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { removeMember, setMemberRole } from "@/app/(app)/leagues/actions";
import { InviteCodeCard } from "@/components/leagues/invite-code-card";
import { Leaderboard, type LeaderboardRow } from "@/components/leagues/leaderboard";
import {
  CommissionerNoteForm,
  LeagueSettingsForm,
} from "@/components/leagues/league-settings-form";
import { NewsFeed } from "@/components/leagues/news-feed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/domain/money";
import { createClient, getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "League" };

export default async function LeaguePage({ params }: PageProps<"/leagues/[id]">) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect(`/sign-in?next=/leagues/${id}`);
  const supabase = await createClient();

  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, invite_code, status, starting_balance_cents, seasons(year)")
    .eq("id", id)
    .maybeSingle();
  if (!league) notFound(); // RLS hides leagues the user is not in

  const [{ data: members }, { data: balances }, { data: events }] = await Promise.all([
    supabase
      .from("league_members")
      .select("user_id, role, eliminated_at, left_at, profiles(display_name)")
      .eq("league_id", id),
    supabase
      .from("league_balances")
      .select("user_id, balance_cents, total_risked_cents")
      .eq("league_id", id),
    supabase
      .from("league_events")
      .select("id, kind, actor_user_id, subject_user_id, payload, created_at")
      .eq("league_id", id)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const names: Record<string, string> = {};
  for (const m of members ?? []) names[m.user_id] = m.profiles?.display_name ?? "Player";
  const active = (members ?? []).filter((m) => !m.left_at);
  const me = active.find((m) => m.user_id === user.id);
  const isCommissioner = me?.role === "commissioner";
  const commissionerCount = active.filter((m) => m.role === "commissioner").length;
  const balanceById = new Map((balances ?? []).map((b) => [b.user_id, b]));

  const rows: LeaderboardRow[] = active.map((m) => ({
    userId: m.user_id,
    displayName: names[m.user_id] ?? "Player",
    balanceCents: balanceById.get(m.user_id)?.balance_cents ?? 0,
    totalRiskedCents: balanceById.get(m.user_id)?.total_risked_cents ?? 0,
    role: m.role,
    eliminatedAt: m.eliminated_at,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{league.name}</h1>
          <p className="text-muted-foreground text-sm">
            {league.seasons?.year} season · starting balance{" "}
            {formatMoney(league.starting_balance_cents)} · {active.length} player
            {active.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link href={`/leagues/${league.id}/picks`}>Make picks</Link>
          </Button>
          {me && !(isCommissioner && commissionerCount === 1) ? (
            <form action={removeMember}>
              <input type="hidden" name="leagueId" value={league.id} />
              <input type="hidden" name="userId" value={user.id} />
              <Button type="submit" variant="ghost" size="sm">
                Leave league
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
            <CardDescription>
              Most money when the playoffs start wins. Hit $0 and you are out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Leaderboard rows={rows} meId={user.id} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {isCommissioner ? (
            <InviteCodeCard leagueId={league.id} code={league.invite_code} />
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>News</CardTitle>
            </CardHeader>
            <CardContent>
              <NewsFeed items={events ?? []} names={names} />
            </CardContent>
          </Card>
        </div>
      </div>

      {isCommissioner ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>League settings</CardTitle>
              <CardDescription>Commissioners only.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <LeagueSettingsForm
                leagueId={league.id}
                name={league.name}
                startingBalanceDollars={league.starting_balance_cents / 100}
              />
              <CommissionerNoteForm leagueId={league.id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>Promote a co-commissioner or remove someone.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {active.map((m) => (
                  <li key={m.user_id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      {names[m.user_id]}
                      <span className="text-muted-foreground ml-2 text-xs">{m.role}</span>
                    </span>
                    {m.user_id !== user.id ? (
                      <span className="flex gap-1">
                        <form action={setMemberRole}>
                          <input type="hidden" name="leagueId" value={league.id} />
                          <input type="hidden" name="userId" value={m.user_id} />
                          <input
                            type="hidden"
                            name="role"
                            value={m.role === "commissioner" ? "member" : "commissioner"}
                          />
                          <Button type="submit" variant="outline" size="sm">
                            {m.role === "commissioner" ? "Demote" : "Make commish"}
                          </Button>
                        </form>
                        <form action={removeMember}>
                          <input type="hidden" name="leagueId" value={league.id} />
                          <input type="hidden" name="userId" value={m.user_id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Remove
                          </Button>
                        </form>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
