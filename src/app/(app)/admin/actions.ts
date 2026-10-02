"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { runJob } from "@/lib/jobs";
import { friendlyDbError } from "@/lib/supabase/errors";
import { createClient, getUser } from "@/lib/supabase/server";

export type AdminActionState = { error?: string; success?: string };

async function requireSiteAdmin(): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("Not signed in");
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("is_site_admin")
    .eq("id", user.id)
    .single();
  if (!data?.is_site_admin) throw new Error("Not authorized");
  return user.id;
}

const syncSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  weeks: z
    .string()
    .trim()
    .optional()
    .transform((raw) => {
      if (!raw) return undefined;
      const parts = raw
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number);
      return parts;
    })
    .pipe(z.array(z.number().int().min(1).max(22)).min(1).max(22).optional()),
});

export async function syncSchedule(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireSiteAdmin();
  const parsed = syncSchema.safeParse({ year: formData.get("year"), weeks: formData.get("weeks") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const result = await runJob("sync_schedule", {
    year: parsed.data.year,
    ...(parsed.data.weeks ? { weeks: parsed.data.weeks } : {}),
  });
  revalidatePath("/admin");
  if (!result.ok) return { error: result.error };
  const { weeks, games, unmatched } = result.body as {
    weeks?: number;
    games?: number;
    unmatched?: unknown[];
  };
  const extra =
    unmatched && unmatched.length ? ` ${unmatched.length} game(s) had unknown teams.` : "";
  return { success: `Synced ${weeks ?? 0} week(s), ${games ?? 0} game(s).${extra}` };
}

function summarizeSettlement(body: Record<string, unknown>): string {
  if (typeof body.skipped === "string") return `Nothing to do: ${body.skipped}.`;
  const results = Array.isArray(body.results) ? (body.results as Record<string, unknown>[]) : [];
  const parts = results.map((r) => {
    const week = `Week ${String(r.week ?? "?")}`;
    return r.ready
      ? `${week}: settled (${String(r.picks_settled ?? 0)} pick(s) graded, ${String(r.eliminated ?? 0)} eliminated, ${String(r.completed ?? 0)} league(s) complete)`
      : `${week}: games still in play (${String(r.picks_settled ?? 0)} pick(s) graded so far)`;
  });
  return parts.length ? parts.join(" ") : "Scores refreshed.";
}

const settlementJobSchema = z.object({ job: z.enum(["sync_finals", "weekly_action_check"]) });

/**
 * Run one of the settlement jobs now instead of waiting for the hourly cron:
 * `sync_finals` refreshes scores and settles finished weeks; `weekly_action_check` applies
 * automatic byes and forced picks for weeks past their last deadline.
 */
export async function runSettlementJob(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireSiteAdmin();
  const parsed = settlementJobSchema.safeParse({ job: formData.get("job") });
  if (!parsed.success) return { error: "Unknown job" };

  const result = await runJob(parsed.data.job);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  if (!result.ok) return { error: result.error };
  if (parsed.data.job === "sync_finals") return { success: summarizeSettlement(result.body) };

  const b = result.body as { skipped?: string; byes?: number; forced?: number; errors?: number };
  if (b.skipped) return { success: `Nothing to do: ${b.skipped}.` };
  const errors = b.errors ? ` ${b.errors} member(s) could not be handled; see the job log.` : "";
  return { success: `${b.byes ?? 0} automatic bye(s), ${b.forced ?? 0} forced pick(s).${errors}` };
}

const seasonSchema = z.object({
  seasonId: z.string().uuid(),
  regularSeasonWeeks: z.coerce.number().int().min(1).max(22),
  playoffsStartAt: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => d === null || !Number.isNaN(d.getTime()), "Invalid date"),
});

/** Season shape: which week settles the winners, and when the playoffs start. */
export async function updateSeason(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireSiteAdmin();
  const parsed = seasonSchema.safeParse({
    seasonId: formData.get("seasonId"),
    regularSeasonWeeks: formData.get("regularSeasonWeeks"),
    playoffsStartAt: formData.get("playoffsStartAt") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_season", {
    p_season_id: parsed.data.seasonId,
    p_regular_season_weeks: parsed.data.regularSeasonWeeks,
    p_playoffs_start_at: parsed.data.playoffsStartAt?.toISOString() ?? null,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/admin");
  return { success: "Season saved." };
}

/** Retire or restore a league without deleting anything (members stop seeing it while archived). */
export async function archiveLeague(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireSiteAdmin();
  const parsed = z
    .object({ leagueId: z.string().uuid(), archived: z.enum(["true", "false"]) })
    .safeParse({ leagueId: formData.get("leagueId"), archived: formData.get("archived") });
  if (!parsed.success) return { error: "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_league", {
    p_league_id: parsed.data.leagueId,
    p_archived: parsed.data.archived === "true",
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/admin/leagues");
  return { success: parsed.data.archived === "true" ? "League archived." : "League restored." };
}
