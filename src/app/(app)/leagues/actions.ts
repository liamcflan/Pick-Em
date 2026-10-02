"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isValidInviteCode, normalizeInviteCode } from "@/lib/domain/invite-code";
import { dollarsToCents } from "@/lib/domain/money";
import { log } from "@/lib/log";
import { friendlyDbError } from "@/lib/supabase/errors";
import { createClient, getUser } from "@/lib/supabase/server";

export type LeagueActionState = { error?: string; success?: string };

const nameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(48, "Name must be at most 48 characters");
const balanceSchema = z.coerce
  .number()
  .int("Whole dollars only")
  .min(1000, "Starting balance must be at least $1,000")
  .max(10_000_000, "Starting balance is too large")
  .refine((v) => v % 1000 === 0, "Starting balance must be a multiple of $1,000");
const uuid = z.string().uuid();

async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function createLeague(
  _prev: LeagueActionState,
  formData: FormData,
): Promise<LeagueActionState> {
  const user = await requireUser();
  const parsed = z.object({ name: nameSchema, balance: balanceSchema.optional() }).safeParse({
    name: formData.get("name"),
    balance: formData.get("balance") ? formData.get("balance") : undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_league", {
    p_name: parsed.data.name,
    p_starting_balance_cents: parsed.data.balance ? dollarsToCents(parsed.data.balance) : null,
  });
  if (error) {
    log.warn("create_league failed", { user_id: user.id, code: error.code });
    return { error: friendlyDbError(error) };
  }
  log.info("league created", { user_id: user.id, league_id: data });
  redirect(`/leagues/${data}`);
}

export async function joinLeague(
  _prev: LeagueActionState,
  formData: FormData,
): Promise<LeagueActionState> {
  const user = await requireUser();
  const raw = String(formData.get("code") ?? "");
  if (!isValidInviteCode(raw))
    return { error: "Invite codes are 8 letters and numbers, like ABCD-EFGH." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_league", { p_code: normalizeInviteCode(raw) });
  if (error) {
    log.warn("join_league failed", { user_id: user.id, code: error.code });
    return { error: friendlyDbError(error) };
  }
  log.info("league joined", { user_id: user.id, league_id: data });
  redirect(`/leagues/${data}`);
}

export async function updateLeague(
  _prev: LeagueActionState,
  formData: FormData,
): Promise<LeagueActionState> {
  await requireUser();
  const parsed = z.object({ leagueId: uuid, name: nameSchema, balance: balanceSchema }).safeParse({
    leagueId: formData.get("leagueId"),
    name: formData.get("name"),
    balance: formData.get("balance"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_league", {
    p_league_id: parsed.data.leagueId,
    p_name: parsed.data.name,
    p_starting_balance_cents: dollarsToCents(parsed.data.balance),
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/leagues/${parsed.data.leagueId}`);
  return { success: "League updated." };
}

export async function postNote(
  _prev: LeagueActionState,
  formData: FormData,
): Promise<LeagueActionState> {
  await requireUser();
  const parsed = z
    .object({
      leagueId: uuid,
      text: z
        .string()
        .trim()
        .min(1, "Write something first")
        .max(500, "Keep it under 500 characters"),
    })
    .safeParse({ leagueId: formData.get("leagueId"), text: formData.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("post_commissioner_note", {
    p_league_id: parsed.data.leagueId,
    p_text: parsed.data.text,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/leagues/${parsed.data.leagueId}`);
  return { success: "Posted." };
}

export async function rotateInviteCode(formData: FormData): Promise<void> {
  await requireUser();
  const leagueId = uuid.parse(formData.get("leagueId"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("rotate_invite_code", { p_league_id: leagueId });
  if (error) throw new Error(friendlyDbError(error));
  revalidatePath(`/leagues/${leagueId}`);
}

export async function setMemberRole(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = z
    .object({ leagueId: uuid, userId: uuid, role: z.enum(["member", "commissioner"]) })
    .parse({
      leagueId: formData.get("leagueId"),
      userId: formData.get("userId"),
      role: formData.get("role"),
    });
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", {
    p_league_id: parsed.leagueId,
    p_user_id: parsed.userId,
    p_role: parsed.role,
  });
  if (error) throw new Error(friendlyDbError(error));
  revalidatePath(`/leagues/${parsed.leagueId}`);
}

export async function removeMember(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = z
    .object({ leagueId: uuid, userId: uuid })
    .parse({ leagueId: formData.get("leagueId"), userId: formData.get("userId") });
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", {
    p_league_id: parsed.leagueId,
    p_user_id: parsed.userId,
  });
  if (error) throw new Error(friendlyDbError(error));
  if (parsed.userId === user.id) redirect("/leagues");
  revalidatePath(`/leagues/${parsed.leagueId}`);
}
