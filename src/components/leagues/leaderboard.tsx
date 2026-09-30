import { formatMoney } from "@/lib/domain/money";

export type LeaderboardRow = {
  userId: string;
  displayName: string;
  balanceCents: number;
  totalRiskedCents: number;
  role: "member" | "commissioner";
  eliminatedAt: string | null;
};

/** Rank by balance desc, then fewer dollars risked. Eliminated members sort last. Pure. */
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

export function Leaderboard({ rows, meId }: { rows: LeaderboardRow[]; meId: string }) {
  const ranked = rankRows(rows);
  return (
    <table className="w-full text-sm" data-testid="leaderboard">
      <thead className="text-muted-foreground text-left text-xs uppercase">
        <tr>
          <th className="py-2 pr-3">#</th>
          <th className="py-2 pr-3">Player</th>
          <th className="py-2 text-right">Balance</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {ranked.map((r) => (
          <tr key={r.userId} className={r.userId === meId ? "font-medium" : undefined}>
            <td className="py-2 pr-3 tabular-nums">{r.rank}</td>
            <td className="py-2 pr-3">
              <span>{r.displayName}</span>
              {r.role === "commissioner" ? (
                <span className="text-muted-foreground ml-2 text-xs">commish</span>
              ) : null}
              {r.eliminatedAt ? (
                <span className="text-destructive ml-2 text-xs">busted</span>
              ) : null}
            </td>
            <td className="py-2 text-right tabular-nums">{formatMoney(r.balanceCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
