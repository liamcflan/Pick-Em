import { expect, test } from "@playwright/test";

/** Needs a running Supabase (CI). */
test("rename yourself from the profile page", async ({ page }) => {
  const email = `e2e-profile-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Display name").fill("Before Rename");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByLabel("Display name").fill("After Rename");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: /\S/ })).toHaveText("Saved.");
  await expect(page.getByTestId("display-name")).toHaveText("After Rename");
});
