import { describe, expect, it } from "vitest";

import { EMPTY_STATS, coverRate, formatPercent, formatRecord, roi } from "./stats";

describe("member stats", () => {
  it("formats records with and without pushes", () => {
    expect(formatRecord({ wins: 7, losses: 3, pushes: 0 })).toBe("7-3");
    expect(formatRecord({ wins: 7, losses: 3, pushes: 1 })).toBe("7-3-1");
  });

  it("treats pushes as losses in the cover rate", () => {
    expect(coverRate({ wins: 3, losses: 1, pushes: 1 })).toBeCloseTo(0.6);
    expect(coverRate(EMPTY_STATS)).toBeNull();
  });

  it("computes ROI on settled money only", () => {
    expect(roi({ net_cents: 100000, settled_risked_cents: 400000 })).toBeCloseTo(0.25);
    expect(roi(EMPTY_STATS)).toBeNull();
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(-0.254)).toBe("-25%");
  });
});
