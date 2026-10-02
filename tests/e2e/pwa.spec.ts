import { expect, test } from "@playwright/test";

// Installable-app checks. These use public pages only, so they need no signed-in user.
test.describe("installable app", () => {
  test("serves a manifest whose icons load, and a never-cached service worker", async ({
    request,
  }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest.start_url).toBe("/dashboard");
    expect(manifest.display).toBe("standalone");
    for (const icon of manifest.icons as { src: string }[]) {
      const img = await request.get(icon.src);
      expect(img.ok(), icon.src).toBe(true);
      expect(img.headers()["content-type"]).toContain("image/png");
    }

    const sw = await request.get("/sw.js");
    expect(sw.ok()).toBe(true);
    expect(sw.headers()["cache-control"]).toContain("no-store");
  });

  test("shows the offline page when a page load fails without a connection", async ({
    page,
    context,
  }) => {
    await page.goto("/sign-in");
    await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, {
      timeout: 15_000,
    });

    await context.setOffline(true);
    try {
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Try again" })).toHaveAttribute(
        "href",
        "/dashboard",
      );
    } finally {
      await context.setOffline(false);
    }
  });

  test("warns while the connection is down", async ({ page, context }) => {
    await page.goto("/sign-in");
    const banner = page.getByTestId("offline-banner");
    await expect(banner).toBeHidden();

    await context.setOffline(true);
    await expect(banner).toBeVisible();
    await context.setOffline(false);
    await expect(banner).toBeHidden();
  });
});

// Signed-in, so this one needs Supabase (CI). iPhone Safari has no install prompt API, so the
// dashboard explains Share > Add to Home Screen once the player starts using the page.
test.describe("install hint on iPhone", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });

  test("appears after the first interaction and stays dismissed", async ({ page }) => {
    const email = `e2e-install-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    await page.goto("/sign-up");
    await page.getByLabel("Display name").fill("Ios");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-battery");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // Typing on the sign-up page already counted as engagement, so start from a fresh visit.
    await page.reload();
    const hint = page.getByTestId("install-hint");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(hint).toBeHidden();
    await page.getByRole("heading", { name: "Dashboard" }).click();
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("Add to Home Screen");

    await hint.getByRole("button", { name: "Not now" }).click();
    await expect(hint).toBeHidden();
    await page.reload();
    await page.getByRole("heading", { name: "Dashboard" }).click();
    await expect(hint).toBeHidden();
  });
});
