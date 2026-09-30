import { describe, expect, it } from "vitest";

import { formatInviteCode, isValidInviteCode, normalizeInviteCode } from "./invite-code";

describe("invite codes", () => {
  it("normalizes user input", () => {
    expect(normalizeInviteCode(" ab-cd efgh ")).toBe("ABCDEFGH");
  });

  it("validates length and alphabet", () => {
    expect(isValidInviteCode("ABCD-EFGH")).toBe(true);
    expect(isValidInviteCode("ABCDEFG")).toBe(false);
    expect(isValidInviteCode("ABCD0FGH")).toBe(false); // zero is not in the alphabet
    expect(isValidInviteCode("ABCDIFGH")).toBe(false); // nor is I
  });

  it("formats for display", () => {
    expect(formatInviteCode("abcdefgh")).toBe("ABCD-EFGH");
    expect(formatInviteCode("ABC")).toBe("ABC");
  });
});
