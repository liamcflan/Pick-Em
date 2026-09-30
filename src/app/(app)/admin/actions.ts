"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { runJob } from "@/lib/jobs";
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
