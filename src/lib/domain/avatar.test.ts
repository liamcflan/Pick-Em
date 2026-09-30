import { describe, expect, it } from "vitest";

import { avatarUrl, initials, isOwnAvatarPath, newAvatarPath } from "./avatar";

const uid = "0f4e7c1a-3b2d-4e5f-8a9b-0c1d2e3f4a5b";

describe("avatar helpers", () => {
  it("accepts only paths inside the member's own folder", () => {
    expect(isOwnAvatarPath(`${uid}/logo-1.webp`, uid)).toBe(true);
    expect(isOwnAvatarPath(`${uid}/../x.webp`, uid)).toBe(false);
    expect(isOwnAvatarPath("00000000-0000-0000-0000-000000000000/logo.webp", uid)).toBe(false);
    expect(isOwnAvatarPath("logo.webp", uid)).toBe(false);
  });

  it("builds public URLs and new paths", () => {
    expect(avatarUrl("https://x.supabase.co/", `${uid}/logo-1.webp`)).toBe(
      `https://x.supabase.co/storage/v1/object/public/logos/${uid}/logo-1.webp`,
    );
    expect(avatarUrl("https://x.supabase.co", null)).toBeNull();
    expect(isOwnAvatarPath(newAvatarPath(uid, 1700000000000), uid)).toBe(true);
  });

  it("derives initials", () => {
    expect(initials("Liam Flanagan")).toBe("LF");
    expect(initials("  bob ")).toBe("B");
    expect(initials("Mary Jo Smith")).toBe("MS");
    expect(initials("")).toBe("?");
  });
});
