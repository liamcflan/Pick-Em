"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { displayNameSchema, firstIssue, passwordSchema } from "@/lib/auth/validation";
import { isOwnAvatarPath } from "@/lib/domain/avatar";
import { errorFields, log } from "@/lib/log";
import { friendlyDbError } from "@/lib/supabase/errors";
import { createClient, getUser } from "@/lib/supabase/server";

export type ProfileActionState = { error?: string; success?: string };

export async function updateProfile(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await getUser();
  if (!user) return { error: "Not signed in." };
  const parsed = z
    .object({ displayName: displayNameSchema })
    .safeParse({ displayName: formData.get("displayName") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", user.id);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/", "layout");
  return { success: "Saved." };
}

const avatarSchema = z.object({ path: z.string().min(3).max(120) });

/** Point the profile at a logo the browser just uploaded to `logos/<uid>/...`. */
export async function setAvatar(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await getUser();
  if (!user) return { error: "Not signed in." };
  const parsed = avatarSchema.safeParse({ path: formData.get("path") });
  if (!parsed.success || !isOwnAvatarPath(parsed.data.path, user.id)) {
    return { error: "That upload does not belong to you." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .single();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: parsed.data.path })
    .eq("id", user.id);
  if (error) return { error: friendlyDbError(error) };

  if (before?.avatar_path && before.avatar_path !== parsed.data.path) {
    const { error: rmError } = await supabase.storage.from("logos").remove([before.avatar_path]);
    if (rmError) log.warn("old logo not removed", { user_id: user.id, ...errorFields(rmError) });
  }
  log.info("logo updated", { user_id: user.id });
  revalidatePath("/", "layout");
  return { success: "Logo updated." };
}

export async function removeAvatar(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState signature
  _prev: ProfileActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<ProfileActionState> {
  const user = await getUser();
  if (!user) return { error: "Not signed in." };
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .single();
  const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", user.id);
  if (error) return { error: friendlyDbError(error) };
  if (before?.avatar_path) await supabase.storage.from("logos").remove([before.avatar_path]);
  revalidatePath("/", "layout");
  return { success: "Logo removed." };
}

/** Signed-in password change (also sets a first password for Google-only accounts). */
export async function changePassword(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await getUser();
  if (!user) return { error: "Not signed in." };
  const parsed = z
    .object({ password: passwordSchema, confirm: z.string() })
    .refine((v) => v.password === v.confirm, {
      message: "Passwords do not match",
      path: ["confirm"],
    })
    .safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    log.warn("password change failed", { user_id: user.id, reason: error.code ?? error.message });
    return { error: error.message };
  }
  log.info("password changed", { user_id: user.id });
  return { success: "Password updated." };
}
