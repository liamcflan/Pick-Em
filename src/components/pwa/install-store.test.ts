import { describe, expect, it } from "vitest";

import { getServerSnapshot, isIos } from "./install-store";

describe("install hint platform detection", () => {
  it("recognises iPhone and iPad Safari", () => {
    expect(isIos("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe(true);
    // iPadOS asks for desktop sites and reports a Mac user agent, but has touch.
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
  });

  it("does not treat desktop Macs or Android as iOS", () => {
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isIos("Mozilla/5.0 (Linux; Android 15; Pixel 9)", 5)).toBe(false);
  });

  it("renders nothing on the server", () => {
    expect(getServerSnapshot()).toBe("hidden");
  });
});
