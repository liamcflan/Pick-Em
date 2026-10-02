"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { BET_UNIT_CENTS } from "@/lib/domain/money";
import { log } from "@/lib/log";
import { friendlyDbError } from "@/lib/supabase/errors";
import { createClient, getUser } from "@/lib/supabase/server";

export type PickActionState = { error?: string; success?: string };

const uuid = z.string().uuid();

async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function placePick(
  _prev: PickActionState,
  formData: FormData,
): Promise<PickActionState> {
  const user = await requireUser();
  const parsed = z
    .object({
      leagueId: uuid,
      gameId: uuid,
      week: z.coerce.number().int().min(1).max(22),
      side: z.enum(["home", "away"]),
      units: z.coerce.number().int().min(1, "Bet at least 1k").max(1000),
    })
    .safeParse({
      leagueId: formData.get("leagueId"),
      gameId: formData.get("gameId"),
      week: formData.get("week"),
      side: formData.get("side"),
      units: formData.get("units"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("place_pick", {
    p_league_id: parsed.data.leagueId,
    p_game_id: parsed.data.gameId,
    p_side: parsed.data.side,
    p_wager_cents: parsed.data.units * BET_UNIT_CENTS,
  });
  if (error) {
    log.warn("place_pick rejected", { user_id: user.id, code: error.code });
    return { error: friendlyDbError(error) };
  }
  log.info("pick placed", {
    user_id: user.id,
    league_id: parsed.data.leagueId,
    game_id: parsed.data.gameId,
  });
  revalidatePath(`/leagues/${parsed.data.leagueId}/picks`);
  revalidatePath("/dashboard");
  return { success: "Saved" };
}

export async function deletePick(
  _prev: PickActionState,
  formData: FormData,
): Promise<PickActionState> {
  const user = await requireUser();
  const parsed = z
    .object({ leagueId: uuid, pickId: uuid })
    .safeParse({ leagueId: formData.get("leagueId"), pickId: formData.get("pickId") });
  if (!parsed.success) return { error: "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_pick", { p_pick_id: parsed.data.pickId });
  if (error) return { error: friendlyDbError(error) };
  log.info("pick removed", { user_id: user.id, pick_id: parsed.data.pickId });
  revalidatePath(`/leagues/${parsed.data.leagueId}/picks`);
  revalidatePath("/dashboard");
  return { success: "Removed" };
}

export async function toggleBye(
  _prev: PickActionState,
  formData: FormData,
): Promise<PickActionState> {
  await requireUser();
  const parsed = z
    .object({ leagueId: uuid, weekId: uuid, action: z.enum(["take", "cancel"]) })
    .safeParse({
      leagueId: formData.get("leagueId"),
      weekId: formData.get("weekId"),
      action: formData.get("action"),
    });
  if (!parsed.success) return { error: "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc(parsed.data.action === "take" ? "take_bye" : "cancel_bye", {
    p_league_id: parsed.data.leagueId,
    p_week_id: parsed.data.weekId,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/leagues/${parsed.data.leagueId}/picks`);
  revalidatePath(`/leagues/${parsed.data.leagueId}`);
  return { success: parsed.data.action === "take" ? "Bye week taken." : "Bye cancelled." };
}
