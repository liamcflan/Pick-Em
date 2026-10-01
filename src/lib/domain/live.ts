/** Is anything in this list of games in play, or about to be? Decides whether to open Realtime. */
export function anyGameLive(
  games: { status: string; kickoff_at: string }[],
  nowMs: number,
  beforeMs = 15 * 60 * 1000,
  afterMs = 6 * 60 * 60 * 1000,
): boolean {
  return games.some((g) => {
    if (g.status === "in_progress") return true;
    if (g.status !== "scheduled") return false;
    const k = new Date(g.kickoff_at).getTime();
    return k - beforeMs <= nowMs && nowMs <= k + afterMs;
  });
}

/** True when a game is in progress but has not been refreshed for a while (feed trouble). */
export function scoresDelayed(
  games: { status: string; last_synced_at: string | null }[],
  nowMs: number,
  staleMs = 10 * 60 * 1000,
): boolean {
  return games.some(
    (g) =>
      g.status === "in_progress" &&
      (!g.last_synced_at || nowMs - new Date(g.last_synced_at).getTime() > staleMs),
  );
}
