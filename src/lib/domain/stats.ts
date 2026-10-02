/** Per-member stats helpers for the history page and leaderboard. Pure. */

export type MemberStats = {
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  open_picks: number;
  settled_risked_cents: number;
  net_cents: number;
  biggest_win_cents: number;
  forced_picks: number;
};

export const EMPTY_STATS: MemberStats = {
  wins: 0,
  losses: 0,
  pushes: 0,
  voids: 0,
  open_picks: 0,
  settled_risked_cents: 0,
  net_cents: 0,
  biggest_win_cents: 0,
  forced_picks: 0,
};

/** "7-3-1" (pushes shown only when there are any). */
export function formatRecord(s: Pick<MemberStats, "wins" | "losses" | "pushes">): string {
  return s.pushes ? `${s.wins}-${s.losses}-${s.pushes}` : `${s.wins}-${s.losses}`;
}

/** Cover rate over decided picks (pushes count as losses, like the rules). Null with no picks. */
export function coverRate(s: Pick<MemberStats, "wins" | "losses" | "pushes">): number | null {
  const n = s.wins + s.losses + s.pushes;
  return n ? s.wins / n : null;
}

/** Net return on money risked in settled picks. Null when nothing has settled. */
export function roi(s: Pick<MemberStats, "net_cents" | "settled_risked_cents">): number | null {
  return s.settled_risked_cents ? s.net_cents / s.settled_risked_cents : null;
}

export function formatPercent(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}
