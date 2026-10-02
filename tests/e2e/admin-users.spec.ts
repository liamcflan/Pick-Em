import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/** Needs a running Supabase and the local service-role key to make the first admin (CI). */
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
test.skip(!serviceKey, "SUPABASE_SERVICE_ROLE_KEY is not set (CI only)");

async function signUp(page: Page, name: string): Promise<string> {
  const email = `e2e-${name.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

test("a site admin makes another player commissioner and site admin", async ({ browser }) => {
  const service = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const tag = `${Date.now()}`.slice(-6);
  const adminCtx = await browser.newContext();
  const playerCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  const player = await playerCtx.newPage();

  // The admin-to-be creates a league; the player joins it.
  const adminEmail = await signUp(admin, `Boss${tag}`);
  await admin.goto("/leagues");
  await admin.getByLabel("League name").fill(`Users League ${tag}`);
  await admin.getByRole("button", { name: "Create league" }).click();
  await expect(admin).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
  const code = (await admin.getByTestId("invite-code").textContent())!.trim();
  const playerEmail = await signUp(player, `Player${tag}`);
  await player.goto("/leagues");
  await player.getByLabel("Invite code").fill(code);
  await player.getByRole("button", { name: "Join league" }).click();
  await expect(player).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);

  // Promote the first account the only way the app allows from outside: the service role.
  const { data: list } = await service.auth.admin.listUsers({ perPage: 1000 });
  const adminId = list!.users.find((u) => u.email === adminEmail)!.id;
  const playerId = list!.users.find((u) => u.email === playerEmail)!.id;
  await service.from("profiles").update({ is_site_admin: true }).eq("id", adminId);

  // Non-admins do not see the page.
  const denied = await player.goto("/admin/users");
  expect(denied?.status()).toBe(404);

  await admin.goto(`/admin/users?q=Player${tag}`);
  const row = admin.getByTestId(`user-${playerId}`);
  await expect(row).toContainText(playerEmail);
  await expect(row).toContainText(`Users League ${tag}`);
  await expect(row).toContainText("Member");

  await row.getByRole("button", { name: "Make commissioner" }).click();
  await expect(row.getByText("Now commissioner.")).toBeVisible();
  await admin.reload();
  await expect(admin.getByTestId(`user-${playerId}`)).toContainText("Commissioner");

  admin.once("dialog", (d) => d.accept());
  await admin.getByTestId(`user-${playerId}`).getByRole("button", { name: "Make admin" }).click();
  await expect(admin.getByTestId(`user-${playerId}`).getByText("Now a site admin.")).toBeVisible();

  // The new admin can open the admin pages.
  await player.goto("/admin/users");
  await expect(player.getByRole("heading", { name: "Users", level: 1 })).toBeVisible();

  await adminCtx.close();
  await playerCtx.close();
});
