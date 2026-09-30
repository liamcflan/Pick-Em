import { describe, expect, it } from "vitest";

import { rankRows, type LeaderboardRow } from "@/lib/domain/leaderboard";

const row = (over: Partial<LeaderboardRow>): LeaderboardRow => ({
  userId: "u",
  displayName: "U",
  balanceCents: 0,
  totalRiskedCents: 0,
  role: "member",
  eliminatedAt: null,
  ...over,
});

describe("rankRows", () => {
  it("ranks by balance, breaks ties by less risked, ties share a rank", () => {
    const out = rankRows([
      row({ userId: "a", balanceCents: 900_000, totalRiskedCents: 300_000 }),
      row({ userId: "b", balanceCents: 1_100_000, totalRiskedCents: 200_000 }),
      row({ userId: "c", balanceCents: 900_000, totalRiskedCents: 100_000 }),
      row({ userId: "d", balanceCents: 900_000, totalRiskedCents: 100_000 }),
    ]);
    expect(out.map((r) => [r.userId, r.rank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["d", 2],
      ["a", 4],
    ]);
  });

  it("puts eliminated players last regardless of balance", () => {
    const out = rankRows([
      row({ userId: "x", balanceCents: 0, eliminatedAt: "2026-10-01T00:00:00Z" }),
      row({ userId: "y", balanceCents: 0 }),
    ]);
    expect(out.map((r) => r.userId)).toEqual(["y", "x"]);
  });
});
