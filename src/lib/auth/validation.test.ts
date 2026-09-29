import { describe, expect, it } from "vitest";

import { safeNext, signInSchema, signUpSchema } from "./validation";

describe("safeNext", () => {
  it("returns the fallback for empty input", () => {
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext(undefined, "/x")).toBe("/x");
  });

  it("accepts same-origin relative paths", () => {
    expect(safeNext("/leagues/abc?tab=picks")).toBe("/leagues/abc?tab=picks");
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeNext("//evil.com")).toBe("/dashboard");
    expect(safeNext("https://evil.com")).toBe("/dashboard");
    expect(safeNext("/\\evil.com")).toBe("/dashboard");
    expect(safeNext("/foo?u=http://x")).toBe("/dashboard");
    expect(safeNext("evil.com")).toBe("/dashboard");
  });
});

describe("schemas", () => {
  it("trims and validates email", () => {
    const r = signInSchema.safeParse({ email: "  a@b.co ", password: "x", remember: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("a@b.co");
  });

  it("enforces password and display name lengths on sign-up", () => {
    expect(
      signUpSchema.safeParse({ email: "a@b.co", password: "short", displayName: "Al" }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({ email: "a@b.co", password: "longenough", displayName: "A" }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({ email: "a@b.co", password: "longenough", displayName: "Alice" })
        .success,
    ).toBe(true);
  });
});
