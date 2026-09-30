import { Avatar } from "@/components/profile/avatar";
import { rankRows, type LeaderboardRow } from "@/lib/domain/leaderboard";
import { formatMoney } from "@/lib/domain/money";

export type { LeaderboardRow };

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
              <Avatar
                name={r.displayName}
                path={r.avatarPath}
                size="sm"
                className="mr-2 inline-block align-middle"
              />
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
