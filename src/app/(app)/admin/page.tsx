import type { Metadata } from "next";
import Link from "next/link";

import { SettlementButtons } from "@/components/admin/job-buttons";
import { SyncScheduleForm } from "@/components/admin/sync-schedule-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin" };

const fmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
});

function when(value: string | null): string {
  return value ? fmt.format(new Date(value)) : "—";
}

export default async function AdminPage() {
  const supabase = await createClient();
  const [{ data: seasons }, { data: weeks }, { data: runs }] = await Promise.all([
    supabase.from("seasons").select("id, year, is_active").order("year", { ascending: false }),
    supabase
      .from("weeks")
      .select(
        "id, season_id, week_number, opens_at, spread_lock_at, first_kickoff_at, last_deadline_at, action_checked_at, settled_at, games(count)",
      )
      .order("week_number"),
    supabase
      .from("job_runs")
      .select("id, job_name, status, started_at, finished_at, request_id, detail")
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  const active = seasons?.find((s) => s.is_active) ?? seasons?.[0];
  const activeWeeks = (weeks ?? []).filter((w) => w.season_id === active?.id);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <nav className="flex gap-3 text-sm">
          <Link href="/admin/lines" className="text-muted-foreground hover:text-foreground">
            Lines
          </Link>
        </nav>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Schedule import</CardTitle>
            <CardDescription>
              Pull the NFL schedule, scores and status from ESPN. Safe to re-run; games are matched
              by ESPN event id.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SyncScheduleForm defaultYear={active?.year ?? new Date().getFullYear()} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Settlement</CardTitle>
            <CardDescription>
              Both run automatically every hour once pg_cron is scheduled. Use these to run them
              now.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SettlementButtons />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent jobs</CardTitle>
            <CardDescription>Every job run is logged with its request id.</CardDescription>
          </CardHeader>
          <CardContent>
            {runs && runs.length ? (
              <ul className="divide-y text-sm">
                {runs.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium">{r.job_name}</div>
                      <div className="text-muted-foreground truncate text-xs">
                        {when(r.started_at)} · {r.request_id ?? "no request id"}
                      </div>
                    </div>
                    <span
                      className={
                        r.status === "succeeded"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : r.status === "failed"
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }
                    >
                      {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">No jobs have run yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{active ? `${active.year} season` : "No season yet"}</CardTitle>
          <CardDescription>
            Deadlines are 11:59 PM Eastern the night before each game. Lines lock Wednesday morning.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeWeeks.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left text-xs uppercase">
                  <tr>
                    <th className="py-2 pr-4">Week</th>
                    <th className="py-2 pr-4">Games</th>
                    <th className="py-2 pr-4">Lines lock</th>
                    <th className="py-2 pr-4">First kickoff</th>
                    <th className="py-2 pr-4">Last deadline</th>
                    <th className="py-2 pr-4">Checked</th>
                    <th className="py-2 pr-4">Settled</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {activeWeeks.map((w) => (
                    <tr key={w.id}>
                      <td className="py-2 pr-4 font-medium">{w.week_number}</td>
                      <td className="py-2 pr-4">{w.games?.[0]?.count ?? 0}</td>
                      <td className="py-2 pr-4">{when(w.spread_lock_at)}</td>
                      <td className="py-2 pr-4">{when(w.first_kickoff_at)}</td>
                      <td className="py-2 pr-4">{when(w.last_deadline_at)}</td>
                      <td className="py-2 pr-4">{when(w.action_checked_at)}</td>
                      <td className="py-2 pr-4">{when(w.settled_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Run the schedule import to populate weeks and games.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
