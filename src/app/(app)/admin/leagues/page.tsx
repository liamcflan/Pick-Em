import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/domain/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Leagues" };

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function AdminLeaguesPage() {
  const supabase = await createClient();
  const [{ data: leagues }, { data: members }, { data: profiles }] = await Promise.all([
    supabase
      .from("leagues")
      .select(
        "id, name, status, invite_code, starting_balance_cents, created_at, created_by, winner_user_id, seasons(year)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("league_members").select("league_id, user_id, eliminated_at, left_at"),
    supabase.from("profiles").select("id, display_name"),
  ]);
  const name = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const stats = new Map<string, { active: number; eliminated: number }>();
  for (const m of members ?? []) {
    if (m.left_at) continue;
    const s = stats.get(m.league_id) ?? { active: 0, eliminated: 0 };
    if (m.eliminated_at) s.eliminated += 1;
    else s.active += 1;
    stats.set(m.league_id, s);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Leagues</h1>
      <Card>
        <CardHeader>
          <CardTitle>All leagues</CardTitle>
          <CardDescription>
            Read-only. Commissioners manage their own leagues; use the audit log to investigate a
            dispute.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {leagues && leagues.length ? (
            <table className="w-full text-sm" data-testid="admin-leagues">
              <thead className="text-muted-foreground text-left text-xs uppercase">
                <tr>
                  <th className="py-2 pr-4">League</th>
                  <th className="py-2 pr-4">Season</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Players</th>
                  <th className="py-2 pr-4">Start</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">Code</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {leagues.map((l) => {
                  const s = stats.get(l.id) ?? { active: 0, eliminated: 0 };
                  return (
                    <tr key={l.id}>
                      <td className="py-2 pr-4 font-medium">
                        {l.name}
                        {l.winner_user_id ? (
                          <span className="text-muted-foreground ml-2 text-xs">
                            winner: {name.get(l.winner_user_id) ?? "?"}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4">{l.seasons?.year ?? "—"}</td>
                      <td className="py-2 pr-4">{l.status}</td>
                      <td className="py-2 pr-4 tabular-nums">
                        {s.active}
                        {s.eliminated ? (
                          <span className="text-muted-foreground"> (+{s.eliminated} out)</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">
                        {formatMoney(l.starting_balance_cents)}
                      </td>
                      <td className="py-2 pr-4">
                        {fmt.format(new Date(l.created_at))}
                        <span className="text-muted-foreground ml-1 text-xs">
                          by {name.get(l.created_by) ?? "?"}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{l.invite_code}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-muted-foreground text-sm">No leagues yet.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
