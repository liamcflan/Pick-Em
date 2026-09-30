import { expect, test, type Page } from "@playwright/test";

/** Needs a running Supabase (CI). Two users: one creates a league, the other joins by code. */
async function signUp(page: Page, name: string) {
  const email = `e2e-${name.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("create a league, join it by invite code, both appear on the leaderboard", async ({
  browser,
}) => {
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  const a = await alice.newPage();
  const b = await bob.newPage();

  await signUp(a, "Alice");
  await a.goto("/leagues");
  await a.getByLabel("League name").fill("E2E Degens");
  await a.getByRole("button", { name: "Create league" }).click();
  await expect(a).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
  await expect(a.getByRole("heading", { name: "E2E Degens" })).toBeVisible();
  const code = (await a.getByTestId("invite-code").textContent())?.trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  await signUp(b, "Bob");
  await b.goto("/leagues");
  await b.getByLabel("Invite code").fill(code!.toLowerCase());
  await b.getByRole("button", { name: "Join league" }).click();
  await expect(b).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
  await expect(b.getByTestId("leaderboard")).toContainText("Alice");
  await expect(b.getByTestId("leaderboard")).toContainText("Bob");
  await expect(b.getByTestId("leaderboard")).toContainText("$10,000");
  await expect(b.getByTestId("invite-code")).toHaveCount(0); // members do not see the code

  // Bob cannot join twice; the error is friendly.
  await b.goto("/leagues");
  await b.getByLabel("Invite code").fill(code!);
  await b.getByRole("button", { name: "Join league" }).click();
  await expect(b.getByRole("alert").filter({ hasText: /\S/ })).toContainText(
    "already in that league",
  );

  // Alice sees Bob join in the news feed and on her dashboard.
  await a.reload();
  await expect(a.getByText("Bob joined the league")).toBeVisible();
  await a.goto("/dashboard");
  await expect(a.getByTestId("dashboard-leagues")).toContainText("E2E Degens");
  await expect(a.getByTestId("dashboard-leagues")).toContainText("of 2");

  await alice.close();
  await bob.close();
});

test("a wrong invite code is rejected without revealing anything", async ({ page }) => {
  await signUp(page, "Solo");
  await page.goto("/leagues");
  await page.getByLabel("Invite code").fill("ZZZZ-ZZZZ");
  await page.getByRole("button", { name: "Join league" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("not found");
});
