import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/**
 * A simulated week, end to end: two members bet against each other on one game, the game goes
 * final, settlement pays the winner, and every surface (picks sheet, leaderboard, dashboard)
 * reflects it. Needs a running Supabase and the service-role key (CI exports both); the
 * service role stands in for the ESPN sync + settlement job.
 */
const SEASON_ID = "10000000-0000-0000-0000-000000002026";
const WEEK_ID = "20000000-0000-0000-0000-000000000005";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(!serviceKey, "SUPABASE_SERVICE_ROLE_KEY is not set (CI only)");

function admin() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signUp(page: Page, name: string) {
  const email = `e2e-${name.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Each run gets its own game so parallel projects never settle each other's picks. */
async function createGame(): Promise<string> {
  const db = admin();
  const { data: teams } = await db
    .from("teams")
    .select("id, abbreviation")
    .in("abbreviation", ["SEA", "LAR"]);
  const home = teams?.find((t) => t.abbreviation === "SEA")?.id;
  const away = teams?.find((t) => t.abbreviation === "LAR")?.id;
  expect(home && away, "seeded teams present").toBeTruthy();
  const kickoff = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
  const { data: game, error } = await db
    .from("games")
    .insert({
      season_id: SEASON_ID,
      week_id: WEEK_ID,
      espn_event_id: `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      home_team_id: home!,
      away_team_id: away!,
      kickoff_at: kickoff,
    })
    .select("id")
    .single();
  expect(error, "game inserted").toBeNull();
  const { error: lineError } = await db.rpc("set_line", {
    p_game_id: game!.id,
    p_home_spread: -3.5,
    p_source: "api",
  });
  expect(lineError, "line set").toBeNull();
  return game!.id;
}

async function finalizeAndSettle(gameId: string) {
  const db = admin();
  const { error } = await db
    .from("games")
    .update({ status: "final", home_score: 27, away_score: 20 })
    .eq("id", gameId);
  expect(error).toBeNull();
  const { data: graded, error: settleError } = await db.rpc("settle_game", { p_game_id: gameId });
  expect(settleError).toBeNull();
  expect(graded).toBe(2);
}

test("bet, go final, settle: winner is paid, loser is charged, everyone sees it", async ({
  browser,
}) => {
  const gameId = await createGame();
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  const a = await alice.newPage();
  const b = await bob.newPage();

  // Alice creates the league and bets 3k on Seattle (-3.5).
  await signUp(a, "Alice");
  await a.goto("/leagues");
  await a.getByLabel("League name").fill("E2E Week");
  await a.getByRole("button", { name: "Create league" }).click();
  await expect(a).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
  const leagueUrl = a.url();
  const code = (await a.getByTestId("invite-code").textContent())?.trim();

  await a.goto(`${leagueUrl}/picks?week=5`);
  await expect(a.getByTestId("available")).toHaveText("$10,000");
  const aRow = a.getByTestId(`game-${gameId}`);
  await aRow.getByRole("button", { name: /^SEA/ }).click();
  await aRow.getByRole("button", { name: "Bet more" }).click();
  await aRow.getByRole("button", { name: "Bet more" }).click();
  await aRow.getByRole("button", { name: "Place bet" }).click();
  await expect(a.getByTestId("available")).toHaveText("$7,000");
  await expect(aRow).toContainText("3k on SEA");

  // Bob joins and takes the Rams for 2k.
  await signUp(b, "Bob");
  await b.goto("/leagues");
  await b.getByLabel("Invite code").fill(code!);
  await b.getByRole("button", { name: "Join league" }).click();
  await expect(b).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
  await b.goto(`${leagueUrl}/picks?week=5`);
  const bRow = b.getByTestId(`game-${gameId}`);
  await bRow.getByRole("button", { name: /^LAR/ }).click();
  await bRow.getByRole("button", { name: "Bet more" }).click();
  await bRow.getByRole("button", { name: "Place bet" }).click();
  await expect(b.getByTestId("available")).toHaveText("$8,000");

  // Open wagers already show on the leaderboard.
  await b.goto(leagueUrl);
  await expect(b.getByTestId("leaderboard")).toContainText("$7,000");
  await expect(b.getByTestId("leaderboard")).toContainText("$8,000");

  // Seattle wins 27-20 and covers. Settlement pays Alice even money.
  await finalizeAndSettle(gameId);

  await a.goto(`${leagueUrl}/picks?week=5`);
  await expect(a.getByTestId(`game-${gameId}`).getByTestId("pick-result")).toHaveText("won");
  await b.goto(`${leagueUrl}/picks?week=5`);
  await expect(b.getByTestId(`game-${gameId}`).getByTestId("pick-result")).toHaveText("lost");

  await a.goto(leagueUrl);
  const board = a.getByTestId("leaderboard");
  await expect(board).toContainText("$13,000");
  await expect(board).toContainText("$8,000");
  await expect(board.locator("tr").nth(1)).toContainText("Alice"); // ranked first

  await a.goto("/dashboard");
  await expect(a.getByTestId("this-week")).toContainText("3k on SEA");
  await expect(a.getByTestId("this-week")).toContainText("won");
  await expect(a.getByTestId("dashboard-leagues")).toContainText("$13,000");

  await alice.close();
  await bob.close();
});
