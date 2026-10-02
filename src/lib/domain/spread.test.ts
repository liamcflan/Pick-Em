import { describe, expect, it } from "vitest";

import { favouriteLabel, formatSpread, sideSpread, underdogSide } from "./spread";

describe("spread helpers", () => {
  it("formats spreads with sign", () => {
    expect(formatSpread(-3.5)).toBe("-3.5");
    expect(formatSpread(2)).toBe("+2");
    expect(formatSpread(0)).toBe("PK");
  });

  it("flips the spread for the away side", () => {
    expect(sideSpread(-3.5, "home")).toBe(-3.5);
    expect(sideSpread(-3.5, "away")).toBe(3.5);
  });

  it("labels the favourite", () => {
    expect(favouriteLabel("NYG", "DAL", -3.5)).toBe("NYG -3.5");
    expect(favouriteLabel("NYG", "DAL", 2.5)).toBe("DAL -2.5");
    expect(favouriteLabel("NYG", "DAL", 0)).toBe("Pick 'em");
  });

  it("finds the underdog", () => {
    expect(underdogSide(-3)).toBe("away");
    expect(underdogSide(3)).toBe("home");
    expect(underdogSide(0)).toBe("away");
  });
});
