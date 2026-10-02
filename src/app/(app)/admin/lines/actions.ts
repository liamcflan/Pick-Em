"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { runJob } from "@/lib/jobs";
import { friendlyDbError } from "@/lib/supabase/errors";
import { createClient, getUser } from "@/lib/supabase/server";

export type LinesActionState = { error?: string; success?: string };

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

const setLineSchema = z.object({
  gameId: z.string().uuid(),
  week: z.coerce.number().int().min(1).max(22),
  homeSpread: z.coerce
    .number()
    .min(-60)
    .max(60)
    .refine((v) => Number.isInteger(v * 2), "Spreads are in half points"),
});

export async function setLine(
  _prev: LinesActionState,
  formData: FormData,
): Promise<LinesActionState> {
  await requireSiteAdmin();
  const parsed = setLineSchema.safeParse({
    gameId: formData.get("gameId"),
    week: formData.get("week"),
    homeSpread: formData.get("homeSpread"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_line", {
    p_game_id: parsed.data.gameId,
    p_home_spread: parsed.data.homeSpread,
    p_source: "admin",
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/admin/lines`);
  return { success: "Line saved." };
}

export async function pullLines(
  _prev: LinesActionState,
  formData: FormData,
): Promise<LinesActionState> {
  await requireSiteAdmin();
  const parsed = z
    .object({ week: z.coerce.number().int().min(1).max(22), force: z.coerce.boolean() })
    .safeParse({ week: formData.get("week"), force: formData.get("force") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const result = await runJob("lock_lines", { week: parsed.data.week, force: parsed.data.force });
  revalidatePath(`/admin/lines`);
  if (!result.ok) return { error: result.error };
  const b = result.body as {
    locked?: number;
    skipped_existing?: number;
    missing_spread?: string[];
    skipped?: string;
  };
  if (b.skipped) return { success: `Nothing to do: ${b.skipped}.` };
  const missing = b.missing_spread?.length
    ? ` ${b.missing_spread.length} game(s) had no spread yet.`
    : "";
  return {
    success: `Locked ${b.locked ?? 0} line(s), kept ${b.skipped_existing ?? 0} existing.${missing}`,
  };
}

/** RULES.md #12: an abandoned game is void and every wager on it is refunded. */
export async function voidGame(
  _prev: LinesActionState,
  formData: FormData,
): Promise<LinesActionState> {
  await requireSiteAdmin();
  const parsed = z
    .object({
      gameId: z.string().uuid(),
      week: z.coerce.number().int().min(1).max(22),
      reason: z.string().trim().max(120).optional(),
    })
    .safeParse({
      gameId: formData.get("gameId"),
      week: formData.get("week"),
      reason: formData.get("reason") ?? undefined,
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("void_game", {
    p_game_id: parsed.data.gameId,
    p_reason: parsed.data.reason || null,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/admin/lines");
  return { success: `Game voided; ${data ?? 0} pick(s) refunded.` };
}
