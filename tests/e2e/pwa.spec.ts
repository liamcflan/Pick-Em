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
