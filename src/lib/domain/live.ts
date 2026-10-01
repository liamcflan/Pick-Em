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
