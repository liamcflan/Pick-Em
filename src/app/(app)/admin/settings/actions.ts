"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { friendlyDbError } from "@/lib/supabase/errors";
import { createClient, getUser } from "@/lib/supabase/server";

export type SettingsActionState = { error?: string; success?: string };

/** Must match the check constraint on app_settings.timezone. */
export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;

const settingsSchema = z.object({
  spreadLockDay: z.coerce.number().int().min(0).max(6),
  spreadLockTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM"),
  timezone: z.enum(TIMEZONES),
  defaultStartingBalanceDollars: z.coerce.number().int().min(1).max(1_000_000),
  betUnitDollars: z.coerce.number().int().min(1).max(100_000),
  hidePicksUntilKickoff: z.boolean(),
});

async function requireSiteAdmin(): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("Not signed in");
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("is_site_admin")
    .eq("id", user.id)
    .single();
  if (!data?.is_site_admin) throw new Error("Not authorized");
}

export async function updateSettings(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  await requireSiteAdmin();
  const parsed = settingsSchema.safeParse({
    spreadLockDay: formData.get("spreadLockDay"),
    spreadLockTime: formData.get("spreadLockTime"),
    timezone: formData.get("timezone"),
    defaultStartingBalanceDollars: formData.get("defaultStartingBalanceDollars"),
    betUnitDollars: formData.get("betUnitDollars"),
    hidePicksUntilKickoff: formData.get("hidePicksUntilKickoff") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("app_settings")
    .select("timezone, spread_lock_day, spread_lock_time")
    .eq("id", 1)
    .single();
  const { error } = await supabase
    .from("app_settings")
    .update({
      spread_lock_day: v.spreadLockDay,
      spread_lock_time: v.spreadLockTime,
      timezone: v.timezone,
      default_starting_balance_cents: v.defaultStartingBalanceDollars * 100,
      bet_unit_cents: v.betUnitDollars * 100,
      hide_picks_until_kickoff: v.hidePicksUntilKickoff,
    })
    .eq("id", 1);
  if (error) return { error: friendlyDbError(error) };

  const notes: string[] = [];
  if (before && before.timezone !== v.timezone) {
    const { data: moved, error: rpcError } = await supabase.rpc("refresh_game_deadlines");
    if (rpcError) return { error: friendlyDbError(rpcError) };
    notes.push(`Deadlines recomputed for ${moved ?? 0} scheduled game(s).`);
  }
  if (
    before &&
    (before.spread_lock_day !== v.spreadLockDay ||
      String(before.spread_lock_time).slice(0, 5) !== v.spreadLockTime)
  ) {
    notes.push("Run the schedule import to apply the new lock time to existing weeks.");
  }
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  return { success: ["Settings saved.", ...notes].join(" ") };
}
