import type { Enums, Json } from "@/lib/supabase/database.types";

export type LeagueEventLike = {
  kind: Enums<"league_event_kind">;
  actor_user_id: string | null;
  subject_user_id: string | null;
  payload: Json;
};

export type NameLookup = (userId: string | null) => string;

function str(payload: Json, key: string): string | undefined {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const v = (payload as Record<string, Json | undefined>)[key];
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

function num(payload: Json, key: string): number | undefined {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const v = (payload as Record<string, Json | undefined>)[key];
    return typeof v === "number" ? v : undefined;
  }
  return undefined;
}

/** One human sentence per news-feed event. Pure, so it is unit-tested. */
export function describeEvent(
  e: LeagueEventLike,
  name: NameLookup,
  formatMoney: (c: number) => string,
): string {
  const actor = name(e.actor_user_id);
  const subject = name(e.subject_user_id);
  switch (e.kind) {
    case "member_joined":
      return str(e.payload, "role") === "commissioner"
        ? `${subject} created the league`
        : `${subject} joined the league`;
    case "member_left":
      return `${subject} left the league`;
    case "member_removed":
      return `${actor} removed ${subject}`;
    case "role_changed":
      return str(e.payload, "role") === "commissioner"
        ? `${actor} made ${subject} a commissioner`
        : `${actor} changed ${subject} back to a member`;
    case "member_eliminated":
      return `${subject} busted out`;
    case "bye_used":
      return `${subject} is on a bye this week`;
    case "forced_pick":
      return `${subject} made no picks, so 1k went on the underdog automatically`;
    case "line_edited":
      return `${actor} adjusted a line`;
    case "spreads_locked":
      return `Lines are locked for week ${num(e.payload, "week") ?? ""}`.trim();
    case "week_settled":
      return `Week ${num(e.payload, "week") ?? ""} is settled`.trim();
    case "season_complete":
      return `Season over. ${subject} wins!`;
    case "commissioner_note":
      return `${actor}: ${str(e.payload, "text") ?? ""}`;
    case "league_updated": {
      const balance = num(e.payload, "starting_balance_cents");
      return balance !== undefined
        ? `${actor} updated the league (starting balance ${formatMoney(balance)})`
        : `${actor} updated the league`;
    }
    default:
      return "Something happened";
  }
}
