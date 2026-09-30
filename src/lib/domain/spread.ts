/** Spread display helpers. `homeSpread` is negative when the home team is favoured. */

export function formatSpread(value: number): string {
  if (value === 0) return "PK";
  return value > 0 ? `+${value}` : `${value}`;
}

/** The spread the picked side gets, e.g. home -3.5 → away +3.5. */
export function sideSpread(homeSpread: number, side: "home" | "away"): number {
  return side === "home" ? homeSpread : -homeSpread;
}

/** "NYG -3.5" for the favourite, or "PK" when even. */
export function favouriteLabel(home: string, away: string, homeSpread: number): string {
  if (homeSpread === 0) return "Pick 'em";
  return homeSpread < 0 ? `${home} ${homeSpread}` : `${away} ${-homeSpread}`;
}

/** The underdog side for a line (used for forced picks; home when even). */
export function underdogSide(homeSpread: number): "home" | "away" {
  return homeSpread > 0 ? "home" : "away";
}
