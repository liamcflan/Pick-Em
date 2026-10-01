import { expect, test, type Page } from "@playwright/test";

/**
 * Self-service password reset, end to end, using the local stack's mail catcher (Mailpit on
 * http://127.0.0.1:54324) to read the reset email. Needs a running Supabase (CI); the full flow
 * skips itself when the mail API is not reachable.
 */
const MAIL_API = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "staple-battery-horse";

async function signUp(page: Page, name: string): Promise<string> {
  const email = `e2e-${name.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

type MailSummary = { ID: string; To: { Address: string }[]; Subject: string };

async function findResetLink(email: string): Promise<string | null> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const list = await fetch(`${MAIL_API}/api/v1/messages?limit=50`).then(
      (r) => (r.ok ? (r.json() as Promise<{ messages: MailSummary[] }>) : null),
      () => null,
    );
    const hit = list?.messages.find((m) => m.To.some((t) => t.Address === email));
    if (hit) {
      const msg = await fetch(`${MAIL_API}/api/v1/message/${hit.ID}`).then(
        (r) => r.json() as Promise<{ Text: string; HTML: string }>,
      );
      const body = `${msg.Text}\n${msg.HTML}`.replace(/&amp;/g, "&");
      const m = /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]*/.exec(body);
      if (m) return m[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

test("forgot-password form never reveals whether an email exists", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status").filter({ hasText: /\S/ })).toContainText(
    "If that email has an account",
  );
});

test("a member resets their password from the emailed link and signs in with the new one", async ({
  page,
}) => {
  // sign-up, sign-out, request, mail-catcher polling (up to 30 s) and two more sign-ins
  test.setTimeout(120_000);
  const reachable = await fetch(`${MAIL_API}/api/v1/messages?limit=1`).then(
    (r) => r.ok,
    () => false,
  );
  test.skip(!reachable, `mail catcher not reachable at ${MAIL_API}`);

  const email = await signUp(page, "Reset");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();

  // The email itself is the proof the request went through (the on-page confirmation is covered
  // by the test above); give the auth server and the mail catcher time to deliver it.
  const link = await findResetLink(email);
  expect(link, "reset email received").toBeTruthy();
  await page.goto(link!);
  await expect(page).toHaveURL(/\/update-password$/);
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a signed-in member can change their password from the profile page", async ({ page }) => {
  const email = await signUp(page, "Changer");
  await page.goto("/profile");
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status").filter({ hasText: /\S/ })).toHaveText("Password updated.");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
