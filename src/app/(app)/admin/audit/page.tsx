import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { changedFields } from "@/lib/domain/audit";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit log" };

const fmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "America/New_York",
});

const TABLES = ["picks", "league_members", "leagues", "lines", "profiles", "app_settings"] as const;

const filterSchema = z.object({
  table: z.enum(TABLES).optional(),
  actor: z.string().uuid().optional(),
  row: z.string().uuid().optional(),
});

function param(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const sp = await searchParams;
  const parsed = filterSchema.safeParse({
    table: param(sp.table),
    actor: param(sp.actor),
    row: param(sp.row),
  });
  const filters = parsed.success ? parsed.data : {};

  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select(
      "id, table_name, row_id, action, actor_id, actor_role, request_id, old_data, new_data, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (filters.table) query = query.eq("table_name", filters.table);
  if (filters.actor) query = query.eq("actor_id", filters.actor);
  if (filters.row) query = query.eq("row_id", filters.row);
  const { data: rows } = await query;

  const actorIds = [...new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", actorIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardDescription>
            Every insert, update and delete on picks, memberships, leagues, lines, profiles and
            settings, with the acting user and request id. Newest first, 100 at a time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-4">
            <select
              name="table"
              defaultValue={filters.table ?? ""}
              aria-label="Table"
              className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm shadow-sm"
            >
              <option value="">All tables</option>
              {TABLES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Input name="actor" placeholder="Actor user id" defaultValue={filters.actor ?? ""} />
            <Input
              name="row"
              placeholder="Row id (e.g. a pick id)"
              defaultValue={filters.row ?? ""}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                Apply
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/admin/audit">Clear</Link>
              </Button>
            </div>
          </form>
          {!parsed.success ? (
            <p className="text-destructive mt-2 text-sm">Ids must be UUIDs.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {rows && rows.length ? (
            <table className="w-full text-sm" data-testid="audit-table">
              <thead className="text-muted-foreground text-left text-xs uppercase">
                <tr>
                  <th className="py-2 pr-4">When (ET)</th>
                  <th className="py-2 pr-4">Table</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Who</th>
                  <th className="py-2 pr-4">Row</th>
                  <th className="py-2 pr-4">Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y align-top">
                {rows.map((r) => {
                  const changes = changedFields(r);
                  return (
                    <tr key={r.id}>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {fmt.format(new Date(r.created_at))}
                      </td>
                      <td className="py-2 pr-4">{r.table_name}</td>
                      <td className="py-2 pr-4">{r.action}</td>
                      <td className="py-2 pr-4">
                        {r.actor_id ? (
                          <Link
                            href={`/admin/audit?actor=${r.actor_id}`}
                            className="hover:underline"
                          >
                            {names.get(r.actor_id) ?? r.actor_id.slice(0, 8)}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{r.actor_role ?? "system"}</span>
                        )}
                        {r.request_id ? (
                          <div
                            className="text-muted-foreground truncate text-xs"
                            title={r.request_id}
                          >
                            req {r.request_id.slice(0, 8)}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4">
                        <Link
                          href={`/admin/audit?table=${r.table_name}&row=${r.row_id}`}
                          className="font-mono text-xs hover:underline"
                        >
                          {r.row_id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        {changes.length ? (
                          <ul className="space-y-0.5 text-xs">
                            {changes.slice(0, 8).map((c) => (
                              <li key={c.key}>
                                <span className="font-medium">{c.key}</span>:{" "}
                                {r.action === "update" ? (
                                  <>
                                    <span className="text-muted-foreground line-through">
                                      {c.from ?? "null"}
                                    </span>{" "}
                                    → {c.to ?? "null"}
                                  </>
                                ) : (
                                  (c.to ?? c.from ?? "null")
                                )}
                              </li>
                            ))}
                            {changes.length > 8 ? (
                              <li className="text-muted-foreground">+{changes.length - 8} more</li>
                            ) : null}
                          </ul>
                        ) : (
                          <span className="text-muted-foreground text-xs">no field changes</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-muted-foreground text-sm">No audit rows match.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
