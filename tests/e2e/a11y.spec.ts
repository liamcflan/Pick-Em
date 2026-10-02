import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/**
 * Automated accessibility checks (axe-core: WCAG 2.1 A and AA plus best practices such as heading
 * order) on every page a player or site admin sees.
 * Public pages need no database; the signed-in pages sign up a fresh user (needs Supabase, as in
 * CI); the admin pages also need the local service-role key to promote that user.
 */
const RULES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

async function signUp(page: Page, name: string): Promise<string> {
  const email = `e2e-a11y-${name.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(RULES).analyze();
  const summary = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n` +
      v.nodes
        .slice(0, 5)
        .map((n) => `    ${n.target.join(" ")}  ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`)
        .join("\n"),
  );
  expect(summary, `axe violations on ${page.url()}`).toEqual([]);
}

test.describe("accessibility: public pages", () => {
  for (const path of [
    "/",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/offline.html",
    "/status",
  ]) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expectAccessible(page);
    });
  }
});

test("accessibility: signed-in pages", async ({ page }) => {
  await signUp(page, "Ada");
  await expectAccessible(page);

  await page.goto("/leagues");
  await expectAccessible(page);
  await page.getByLabel("League name").fill("A11y League");
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
  const leagueUrl = page.url();
  await expectAccessible(page);

  await page.goto(`${leagueUrl}/picks`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectAccessible(page);

  await page.goto(`${leagueUrl}/history`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectAccessible(page);

  await page.goto("/profile");
  await expectAccessible(page);
});

test("accessibility: admin pages", async ({ page }) => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  test.skip(!serviceKey, "SUPABASE_SERVICE_ROLE_KEY is not set (CI only)");
  const service = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = await signUp(page, "Grace");
  const { data: users, error } = await service.auth.admin.listUsers({ perPage: 1000 });
  expect(error).toBeNull();
  const id = users.users.find((u) => u.email === email)?.id;
  expect(id).toBeTruthy();
  const { error: promoteError } = await service
    .from("profiles")
    .update({ is_site_admin: true })
    .eq("id", id!);
  expect(promoteError).toBeNull();

  for (const path of [
    "/admin",
    "/admin/lines",
    "/admin/leagues",
    "/admin/settings",
    "/admin/audit",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectAccessible(page);
  }
});
