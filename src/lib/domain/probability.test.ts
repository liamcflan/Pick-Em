import { describe, expect, it } from "vitest";

import { coverProbability, fractionRemaining, normalCdf } from "./probability";

describe("fractionRemaining", () => {
  it("maps status, period and clock to the share of the game left", () => {
    expect(fractionRemaining("scheduled", null, null)).toBe(1);
    expect(fractionRemaining("in_progress", 1, "15:00")).toBe(1);
    expect(fractionRemaining("in_progress", 2, "0:00")).toBe(0.5);
    expect(fractionRemaining("in_progress", 4, "7:30")).toBeCloseTo(0.125);
    expect(fractionRemaining("in_progress", 5, "10:00")).toBeCloseTo(10 / 60);
    expect(fractionRemaining("final", 4, "0:00")).toBe(0);
  });
});

describe("normalCdf", () => {
  it("matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });
});

describe("coverProbability", () => {
  it("is a coin flip before kickoff for either side", () => {
    const base = { homeScore: 0, awayScore: 0, homeSpread: -3.5, fractionRemaining: 1 };
    expect(coverProbability({ ...base, side: "home" })).toBeCloseTo(0.5, 6);
    expect(coverProbability({ ...base, side: "away" })).toBeCloseTo(0.5, 6);
  });

  it("rises for the side that is beating the number as time runs out", () => {
    const up10AtHalf = coverProbability({
      homeScore: 20,
      awayScore: 10,
      homeSpread: -3.5,
      side: "home",
      fractionRemaining: 0.5,
    });
    const up10Late = coverProbability({
      homeScore: 20,
      awayScore: 10,
      homeSpread: -3.5,
      side: "home",
      fractionRemaining: 0.05,
    });
    expect(up10AtHalf).toBeGreaterThan(0.6);
    expect(up10Late).toBeGreaterThan(up10AtHalf);
    expect(up10Late).toBeGreaterThan(0.95);
  });

  it("collapses to won / lost / push at the final whistle", () => {
    const final = { homeScore: 27, awayScore: 20, fractionRemaining: 0 };
    expect(coverProbability({ ...final, homeSpread: -3.5, side: "home" })).toBe(1);
    expect(coverProbability({ ...final, homeSpread: -3.5, side: "away" })).toBe(0);
    expect(coverProbability({ ...final, homeSpread: -7, side: "home" })).toBe(0); // push
    expect(coverProbability({ ...final, homeSpread: -7, side: "away" })).toBe(0); // push
  });

  it("home and away probabilities are complementary while the game is live", () => {
    const base = { homeScore: 14, awayScore: 17, homeSpread: 2.5, fractionRemaining: 0.3 };
    const h = coverProbability({ ...base, side: "home" });
    const a = coverProbability({ ...base, side: "away" });
    expect(h + a).toBeCloseTo(1, 6);
  });
});
