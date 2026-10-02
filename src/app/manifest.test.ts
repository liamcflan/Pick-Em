import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "./manifest";

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): string {
  const bytes = readFileSync(file);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("web app manifest", () => {
  const m = manifest();

  it("opens standalone on the dashboard", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/dashboard");
    expect(m.scope).toBe("/");
  });

  it("ships the 192 and 512 icons installers require, plus a maskable one", () => {
    const icons = m.icons ?? [];
    expect(icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("points every icon at a real PNG of the declared size", () => {
    for (const icon of m.icons ?? []) {
      expect(pngSize(join(process.cwd(), "public", icon.src))).toBe(icon.sizes);
    }
  });
});
