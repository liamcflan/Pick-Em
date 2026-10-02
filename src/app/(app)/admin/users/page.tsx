import type { Metadata } from "next";
import { z } from "zod";

import { LeagueRoleButton, SiteAdminButton } from "@/components/admin/user-role-buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createClient, getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Users" };

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

const leagueSchema = z.array(
  z.object({
    league_id: z.string(),
    league_name: z.string(),
    role: z.enum(["member", "commissioner"]),
    archived: z.boolean(),
  }),
);

const searchSchema = z.object({ q: z.string().trim().max(100).optional() });

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const parsed = searchSchema.safeParse(await searchParams);
  const q = parsed.success ? (parsed.data.q ?? "") : "";
  const me = await getUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users");

  const needle = q.toLowerCase();
  const users = (data ?? [])
    .map((u) => ({ ...u, leagues: leagueSchema.catch([]).parse(u.leagues) }))
    .filter(
      (u) =>
        !needle ||
        u.display_name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle),
    );
  const adminCount = (data ?? []).filter((u) => u.is_site_admin).length;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <Card>
        <CardHeader>
          <CardTitle>Everyone with an account</CardTitle>
          <CardDescription>
            Site admins can edit lines, settle games and manage every league and user. Commissioners
            manage one league. There is always at least one site admin and one commissioner per
            league; every change is in the audit log.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap items-end gap-2" role="search">
            <div className="space-y-1">
              <Label htmlFor="user-search">Search by name or email</Label>
              <Input id="user-search" name="q" defaultValue={q} className="w-64" />
            </div>
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              Could not load users: {error.message}
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              {users.length} {users.length === 1 ? "user" : "users"}
              {q ? ` matching "${q}"` : ""} · {adminCount} site{" "}
              {adminCount === 1 ? "admin" : "admins"}
            </p>
          )}

          <ul className="divide-y rounded-lg border" data-testid="admin-users">
            {users.map((u) => (
              <li key={u.id} className="space-y-2 p-3 text-sm" data-testid={`user-${u.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {u.display_name}
                      {u.id === me?.id ? (
                        <span className="text-muted-foreground font-normal"> (you)</span>
                      ) : null}
                      {u.is_site_admin ? (
                        <span className="bg-secondary ml-2 rounded px-1.5 py-0.5 text-xs font-medium">
                          Site admin
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground break-all">{u.email}</p>
                    <p className="text-muted-foreground text-xs">
                      Joined {fmt.format(new Date(u.created_at))} · Last sign-in{" "}
                      {u.last_sign_in_at ? fmt.format(new Date(u.last_sign_in_at)) : "never"}
                    </p>
                  </div>
                  <SiteAdminButton
                    userId={u.id}
                    name={u.display_name}
                    isAdmin={u.is_site_admin}
                    isSelf={u.id === me?.id}
                  />
                </div>
                {u.leagues.length ? (
                  <ul className="space-y-1 pl-2">
                    {u.leagues.map((l) => (
                      <li key={l.league_id} className="flex flex-wrap items-center gap-2">
                        <span>
                          {l.league_name}
                          {l.archived ? (
                            <span className="text-muted-foreground"> (archived)</span>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground">
                          {l.role === "commissioner" ? "Commissioner" : "Member"}
                        </span>
                        <LeagueRoleButton leagueId={l.league_id} userId={u.id} role={l.role} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground pl-2 text-xs">Not in any league.</p>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
