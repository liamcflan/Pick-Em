/** Money helpers. Balances are integer cents; the pool bets in whole thousands. */

export const BET_UNIT_CENTS = 100_000; // $1,000

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** "$10,000" */
export function formatMoney(cents: number): string {
  return usd.format(Math.round(cents / 100));
}

/** "10k", "1.5k", "0" — compact form for tight leaderboard rows. */
export function formatK(cents: number): string {
  const k = cents / BET_UNIT_CENTS;
  if (k === 0) return "0";
  return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function isWholeUnits(cents: number, unit = BET_UNIT_CENTS): boolean {
  return Number.isInteger(cents) && cents > 0 && cents % unit === 0;
}
