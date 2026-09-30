import { describe, expect, it } from "vitest";

import { dollarsToCents, formatK, formatMoney, isWholeUnits } from "./money";

describe("money", () => {
  it("formats whole dollars", () => {
    expect(formatMoney(1_000_000)).toBe("$10,000");
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(-150_000)).toBe("-$1,500");
  });

  it("formats compact thousands", () => {
    expect(formatK(1_000_000)).toBe("10k");
    expect(formatK(150_000)).toBe("1.5k");
    expect(formatK(0)).toBe("0");
  });

  it("converts dollars to cents without float drift", () => {
    expect(dollarsToCents(10000)).toBe(1_000_000);
    expect(dollarsToCents(0.1 + 0.2)).toBe(30);
  });

  it("validates whole betting units", () => {
    expect(isWholeUnits(100_000)).toBe(true);
    expect(isWholeUnits(300_000)).toBe(true);
    expect(isWholeUnits(150_000)).toBe(false);
    expect(isWholeUnits(0)).toBe(false);
    expect(isWholeUnits(-100_000)).toBe(false);
  });
});
