/** Leaderboard ordering. Pure so it is unit-tested without React or env. */
export type LeaderboardRow = {
  userId: string;
  displayName: string;
  balanceCents: number;
  totalRiskedCents: number;
  role: "member" | "commissioner";
  eliminatedAt: string | null;
  avatarPath?: string | null;
};

/** Rank by balance desc, then fewer dollars risked. Eliminated members sort last. */
export function rankRows(rows: LeaderboardRow[]): (LeaderboardRow & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => {
    if (!!a.eliminatedAt !== !!b.eliminatedAt) return a.eliminatedAt ? 1 : -1;
    if (b.balanceCents !== a.balanceCents) return b.balanceCents - a.balanceCents;
    return a.totalRiskedCents - b.totalRiskedCents;
  });
  let rank = 0;
  let prev: LeaderboardRow | undefined;
  return sorted.map((row, i) => {
    if (
      !prev ||
      prev.balanceCents !== row.balanceCents ||
      prev.totalRiskedCents !== row.totalRiskedCents ||
      !!prev.eliminatedAt !== !!row.eliminatedAt
    ) {
      rank = i + 1;
    }
    prev = row;
    return { ...row, rank };
  });
}
