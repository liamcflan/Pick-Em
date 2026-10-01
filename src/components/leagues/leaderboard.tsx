import Link from "next/link";

import { Avatar } from "@/components/profile/avatar";
import { rankRows, type LeaderboardRow } from "@/lib/domain/leaderboard";
import { formatMoney } from "@/lib/domain/money";

export type { LeaderboardRow };

function delta(cents: number | undefined): { text: string; className: string } {
  if (cents === undefined || cents === 0) return { text: "—", className: "text-muted-foreground" };
  return cents > 0
    ? { text: `+${formatMoney(cents)}`, className: "text-emerald-700 dark:text-emerald-400" }
    : { text: `−${formatMoney(-cents)}`, className: "text-destructive" };
}

export function Leaderboard({
  rows,
  meId,
  weekLabel,
}: {
  rows: LeaderboardRow[];
  meId: string;
  /** When set, a column shows each member's net movement this week. */
  weekLabel?: string;
}) {
  const ranked = rankRows(rows);
  return (
    <table className="w-full text-sm" data-testid="leaderboard">
      <thead className="text-muted-foreground text-left text-xs uppercase">
        <tr>
          <th className="py-2 pr-3">#</th>
          <th className="py-2 pr-3">Player</th>
          <th className="py-2 pr-3 text-right">ATS</th>
          {weekLabel ? <th className="py-2 pr-3 text-right">{weekLabel}</th> : null}
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
              {r.href ? (
                <Link href={r.href} className="hover:underline">
                  {r.displayName}
                </Link>
              ) : (
                <span>{r.displayName}</span>
              )}
              {r.role === "commissioner" ? (
                <span className="text-muted-foreground ml-2 text-xs">commish</span>
              ) : null}
              {r.eliminatedAt ? (
                <span className="text-destructive ml-2 text-xs">busted</span>
              ) : null}
            </td>
            <td className="text-muted-foreground py-2 pr-3 text-right tabular-nums">
              {r.record ?? "—"}
            </td>
            {weekLabel ? (
              <td
                className={`py-2 pr-3 text-right tabular-nums ${delta(r.weekDeltaCents).className}`}
              >
                {delta(r.weekDeltaCents).text}
              </td>
            ) : null}
            <td className="py-2 text-right tabular-nums">{formatMoney(r.balanceCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
