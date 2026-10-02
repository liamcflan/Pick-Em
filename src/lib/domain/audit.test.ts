import { describe, expect, it } from "vitest";

import { changedFields } from "./audit";

describe("changedFields", () => {
  it("lists only the fields an update changed, ignoring timestamps", () => {
    expect(
      changedFields({
        action: "update",
        old_data: { id: "1", side: "home", wager_cents: 100000, updated_at: "a" },
        new_data: { id: "1", side: "away", wager_cents: 100000, updated_at: "b" },
      }),
    ).toEqual([{ key: "side", from: "home", to: "away" }]);
  });

  it("lists non-null fields for inserts and everything for deletes", () => {
    expect(
      changedFields({ action: "insert", old_data: null, new_data: { a: 1, b: null } }),
    ).toEqual([{ key: "a", from: null, to: "1" }]);
    expect(changedFields({ action: "delete", old_data: { a: 1 }, new_data: null })).toEqual([
      { key: "a", from: "1", to: null },
    ]);
  });

  it("truncates long values", () => {
    const long = "x".repeat(100);
    expect(
      changedFields({ action: "insert", old_data: null, new_data: { t: long } })[0]?.to,
    ).toHaveLength(48);
  });
});
