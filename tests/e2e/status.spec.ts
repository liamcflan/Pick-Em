import { expect, test } from "@playwright/test";

// Needs a running Supabase with migrations applied (CI). The page is public.
test("status page reports a reachable, migrated Supabase", async ({ page }) => {
  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "Status", level: 1 })).toBeVisible();
  const checks = page.getByTestId("status-checks");
  await expect(
    checks.getByRole("listitem").filter({ hasText: "Supabase reachable" }),
  ).toContainText("OK");
  await expect(checks.getByRole("listitem").filter({ hasText: "Database tables" })).toContainText(
    "All migrations applied.",
  );
  await expect(page.getByTestId("status-commit")).toBeVisible();
});
