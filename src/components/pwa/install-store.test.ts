import { describe, expect, it } from "vitest";

import {
  getServerSnapshot,
  installMode,
  isIos,
  isMobileDevice,
  type InstallInputs,
} from "./install-store";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/141.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0 Safari/537.36";

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

describe("install hint visibility", () => {
  const base: InstallInputs = {
    userAgent: ANDROID,
    maxTouchPoints: 5,
    engaged: true,
    standalone: false,
    dismissed: false,
    canPrompt: true,
  };

  it("never shows on a desktop or laptop, even when the browser offers to install", () => {
    expect(installMode({ ...base, userAgent: WINDOWS, maxTouchPoints: 0 })).toBe("hidden");
    expect(installMode({ ...base, userAgent: MAC, maxTouchPoints: 0 })).toBe("hidden");
    // Touch-screen Windows laptops are still desktops.
    expect(installMode({ ...base, userAgent: WINDOWS, maxTouchPoints: 10 })).toBe("hidden");
  });

  it("offers the browser's install button on Android", () => {
    expect(installMode(base)).toBe("prompt");
  });

  it("explains Add to Home Screen on iPhone and iPad", () => {
    expect(installMode({ ...base, userAgent: IPHONE, canPrompt: false })).toBe("ios");
    expect(installMode({ ...base, userAgent: MAC, maxTouchPoints: 5, canPrompt: false })).toBe(
      "ios",
    );
  });

  it("waits for engagement and respects install and dismissal", () => {
    expect(installMode({ ...base, engaged: false })).toBe("hidden");
    expect(installMode({ ...base, standalone: true })).toBe("hidden");
    expect(installMode({ ...base, dismissed: true })).toBe("hidden");
  });

  it("classifies devices", () => {
    expect(isMobileDevice(IPHONE, 5)).toBe(true);
    expect(isMobileDevice(ANDROID, 5)).toBe(true);
    expect(isMobileDevice(WINDOWS, 10)).toBe(false);
    expect(isMobileDevice(MAC, 0)).toBe(false);
  });
});
