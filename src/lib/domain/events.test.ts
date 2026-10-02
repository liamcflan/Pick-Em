import { describe, expect, it } from "vitest";

import { describeEvent } from "./events";
import { formatMoney } from "./money";

const names: Record<string, string> = { a: "Alice", b: "Bob" };
const name = (id: string | null) => (id && names[id]) || "A former member";

describe("describeEvent", () => {
  it("describes joins and creation", () => {
    expect(
      describeEvent(
        {
          kind: "member_joined",
          actor_user_id: "a",
          subject_user_id: "a",
          payload: { role: "commissioner" },
        },
        name,
        formatMoney,
      ),
    ).toBe("Alice created the league");
    expect(
      describeEvent(
        { kind: "member_joined", actor_user_id: "b", subject_user_id: "b", payload: {} },
        name,
        formatMoney,
      ),
    ).toBe("Bob joined the league");
  });

  it("describes commissioner actions", () => {
    expect(
      describeEvent(
        {
          kind: "role_changed",
          actor_user_id: "a",
          subject_user_id: "b",
          payload: { role: "commissioner" },
        },
        name,
        formatMoney,
      ),
    ).toBe("Alice made Bob a commissioner");
    expect(
      describeEvent(
        { kind: "member_removed", actor_user_id: "a", subject_user_id: "b", payload: {} },
        name,
        formatMoney,
      ),
    ).toBe("Alice removed Bob");
    expect(
      describeEvent(
        {
          kind: "commissioner_note",
          actor_user_id: "a",
          subject_user_id: null,
          payload: { text: "Get picks in" },
        },
        name,
        formatMoney,
      ),
    ).toBe("Alice: Get picks in");
    expect(
      describeEvent(
        {
          kind: "league_updated",
          actor_user_id: "a",
          subject_user_id: null,
          payload: { starting_balance_cents: 500000 },
        },
        name,
        formatMoney,
      ),
    ).toBe("Alice updated the league (starting balance $5,000)");
  });

  it("falls back for unknown users", () => {
    expect(
      describeEvent(
        { kind: "member_left", actor_user_id: "zz", subject_user_id: "zz", payload: {} },
        name,
        formatMoney,
      ),
    ).toBe("A former member left the league");
  });

  it("describes settlement events", () => {
    expect(
      describeEvent(
        {
          kind: "bye_used",
          actor_user_id: null,
          subject_user_id: "b",
          payload: { week: 5, automatic: true },
        },
        name,
        formatMoney,
      ),
    ).toBe("Bob made no picks, so their bye was used automatically");
    expect(
      describeEvent(
        { kind: "bye_used", actor_user_id: "b", subject_user_id: "b", payload: { week: 5 } },
        name,
        formatMoney,
      ),
    ).toBe("Bob is on a bye this week");
    expect(
      describeEvent(
        {
          kind: "member_eliminated",
          actor_user_id: null,
          subject_user_id: "b",
          payload: { week: 5 },
        },
        name,
        formatMoney,
      ),
    ).toBe("Bob busted out in week 5");
    expect(
      describeEvent(
        {
          kind: "season_complete",
          actor_user_id: null,
          subject_user_id: "a",
          payload: { week: 14, reason: "last_standing" },
        },
        name,
        formatMoney,
      ),
    ).toBe("Alice is the last one standing and wins the league!");
    expect(
      describeEvent(
        {
          kind: "season_complete",
          actor_user_id: null,
          subject_user_id: "a",
          payload: { week: 18, reason: "season_end" },
        },
        name,
        formatMoney,
      ),
    ).toBe("Season over. Alice wins with the most money!");
  });
});
