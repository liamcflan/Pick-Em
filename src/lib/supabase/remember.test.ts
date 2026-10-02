import { describe, expect, it } from "vitest";

import { applyPersistence, shouldPersist } from "./remember";

describe("remember me", () => {
  it("persists by default and when the preference is '1'", () => {
    expect(shouldPersist(undefined)).toBe(true);
    expect(shouldPersist("1")).toBe(true);
  });

  it("does not persist when the preference is '0'", () => {
    expect(shouldPersist("0")).toBe(false);
  });

  it("strips expiry attributes for session cookies and leaves others intact", () => {
    const attrs = { path: "/", maxAge: 100, expires: new Date(0), sameSite: "lax" as const };
    expect(applyPersistence(attrs, true)).toEqual(attrs);
    expect(applyPersistence(attrs, false)).toEqual({ path: "/", sameSite: "lax" });
  });
});
