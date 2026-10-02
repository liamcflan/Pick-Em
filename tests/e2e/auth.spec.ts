import { expect, test } from "@playwright/test";

/**
 * Smoke tests that need a running Supabase (CI starts one). Sign-up works without email
 * confirmation because the local config has `enable_confirmations = false`.
 */
test("landing page renders and links to sign in", async ({ page }) => {
  const cspViolations: string[] = [];
  page.on("console", (msg) => {
    if (msg.text().includes("Content Security Policy")) cspViolations.push(msg.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pick-Em" })).toBeVisible();
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(cspViolations, "no CSP violations while rendering and navigating").toEqual([]);
});

test("responses carry security headers", async ({ request }) => {
  const res = await request.get("/sign-in");
  const headers = res.headers();
  expect(headers["content-security-policy"]).toMatch(
    /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
  );
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("protected routes redirect to sign in with a next param", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard$/);
});

test("sign up, land on dashboard, stay signed in after a fresh page load, sign out", async ({
  page,
  context,
}) => {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Display name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("display-name")).toHaveText("E2E Tester");

  // Auth cookies are persistent by default ("remember me").
  const cookies = await context.cookies();
  const authCookie = cookies.find((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  expect(authCookie, "auth cookie present").toBeTruthy();
  expect(authCookie!.expires, "auth cookie is persistent").toBeGreaterThan(Date.now() / 1000);

  const fresh = await context.newPage();
  await fresh.goto("/dashboard");
  await expect(fresh.getByTestId("display-name")).toHaveText("E2E Tester");
  await fresh.close();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard$/);
});

test("unchecking remember me yields session cookies", async ({ page, context }) => {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Display name").fill("Session Only");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  // Wait for the sign-out action to finish and land on /sign-in; navigating earlier races the
  // session cookie removal and the proxy bounces a still-signed-in user back to the dashboard.
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByLabel("Remember me on this device").uncheck();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const cookies = await context.cookies();
  const authCookie = cookies.find((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  expect(authCookie).toBeTruthy();
  expect(authCookie!.expires, "session cookie has no expiry").toBe(-1);
});
