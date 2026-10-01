/**
 * In-game chance that a pick covers (Phase 2). Pure, unit-tested.
 *
 * Model (Stern 1991): the rest-of-game margin is normal with mean = the pregame expectation
 * scaled by the fraction of the game left, and standard deviation 13.5 points (the historical
 * spread of NFL final margins) scaled by the square root of that fraction. Pregame that gives
 * exactly 50/50 against the spread; at the final whistle it collapses to won/lost. Pushes are
 * treated as losses, matching the league rules.
 */

export const FINAL_MARGIN_SD = 13.5;
const REGULATION_SECONDS = 4 * 15 * 60;
const OVERTIME_SECONDS = 10 * 60;

/** Fraction of game time remaining (1 = not started, 0 = final). `clock` is "MM:SS". */
export function fractionRemaining(
  status: string,
  period: number | null | undefined,
  clock: string | null | undefined,
): number {
  if (status === "final" || status === "void") return 0;
  if (status !== "in_progress" || !period) return 1;
  const m = /^(\d+):(\d{2})$/.exec(clock ?? "");
  const seconds = m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  if (period >= 5) {
    // overtime: little time left; keep a sliver of uncertainty rather than zero
    return Math.min(seconds, OVERTIME_SECONDS) / REGULATION_SECONDS;
  }
  const left = (4 - period) * 15 * 60 + seconds;
  return Math.max(0, Math.min(1, left / REGULATION_SECONDS));
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, error < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = Math.exp(-0.5 * z * z) * 0.3989422804014327 * poly;
  return z >= 0 ? 1 - tail : tail;
}

export type CoverInput = {
  homeScore: number;
  awayScore: number;
  /** Negative = home favoured, as stored on the line. */
  homeSpread: number;
  side: "home" | "away";
  fractionRemaining: number;
};

/** Probability (0–1) that the pick covers its spread given the current state. */
export function coverProbability(input: CoverInput): number {
  const { homeScore, awayScore, homeSpread, side } = input;
  const f = Math.max(0, Math.min(1, input.fractionRemaining));
  const margin = homeScore - awayScore; // current home margin
  const needed = -(margin + homeSpread); // rest-of-game home margin needed to cover exactly
  let homeCovers: number;
  if (f === 0) {
    homeCovers = margin + homeSpread > 0 ? 1 : 0;
    const push = margin + homeSpread === 0;
    if (push) return 0; // a push loses for whoever bet it
  } else {
    const mean = -homeSpread * f;
    const sd = FINAL_MARGIN_SD * Math.sqrt(f);
    homeCovers = 1 - normalCdf((needed - mean) / sd);
  }
  return side === "home" ? homeCovers : 1 - homeCovers;
}

/** "72%" style label; null when the game has not started (always 50%, so not informative). */
export function coverLabel(p: number | null): string | null {
  if (p === null) return null;
  return `${Math.round(p * 100)}%`;
}
