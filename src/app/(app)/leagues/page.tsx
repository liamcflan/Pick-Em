import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateLeagueForm } from "@/components/leagues/create-league-form";
import { JoinLeagueForm } from "@/components/leagues/join-league-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/domain/money";
import { createClient, getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Leagues" };

export default async function LeaguesPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/leagues");
  const supabase = await createClient();

  const [{ data: memberships }, { data: balances }, { data: allMembers }, { data: settings }] =
    await Promise.all([
      supabase
        .from("league_members")
        .select("league_id, role, leagues(id, name, status, starting_balance_cents)")
        .eq("user_id", user.id)
        .is("left_at", null),
      supabase
        .from("league_balances")
        .select("league_id, user_id, balance_cents")
        .eq("user_id", user.id),
      supabase.from("league_members").select("league_id").is("left_at", null),
      supabase.from("app_settings").select("default_starting_balance_cents").eq("id", 1).single(),
    ]);

  const balanceByLeague = new Map((balances ?? []).map((b) => [b.league_id, b.balance_cents ?? 0]));
  const memberCount = new Map<string, number>();
  for (const m of allMembers ?? [])
    memberCount.set(m.league_id, (memberCount.get(m.league_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Leagues</h1>

      {memberships && memberships.length ? (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="my-leagues">
          {memberships.map((m) => {
            const league = m.leagues;
            if (!league) return null;
            return (
              <li key={m.league_id}>
                <Link href={`/leagues/${league.id}`} className="block">
                  <Card className="hover:bg-accent/40 transition-colors">
                    <CardHeader>
                      <CardTitle>{league.name}</CardTitle>
                      <CardDescription>
                        {memberCount.get(league.id) ?? 1} player
                        {(memberCount.get(league.id) ?? 1) === 1 ? "" : "s"}
                        {m.role === "commissioner" ? " · you are a commissioner" : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-lg font-medium tabular-nums">
                      {formatMoney(balanceByLeague.get(league.id) ?? 0)}
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          You are not in a league yet. Create one or join with a code.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Join a league</CardTitle>
            <CardDescription>Got a code from a friend? Enter it here.</CardDescription>
          </CardHeader>
          <CardContent>
            <JoinLeagueForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Create a league</CardTitle>
            <CardDescription>You become its first commissioner. Add more later.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateLeagueForm
              defaultBalance={(settings?.default_starting_balance_cents ?? 1_000_000) / 100}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
