// Published sports fee coefficients, only for the studied 2026 race windows.
// Market-specific activation or an exception must be verified independently.
const FIRST_WINDOW = Date.parse('2026-06-24T00:00:00Z');
const SPORTS_UPDATE = Date.parse('2026-07-10T00:00:00Z');
const LAST_WINDOW_END = Date.parse('2026-09-05T00:00:00Z');

/** Category-level fee scenario, not proof of an individual market's fee schedule. */
export function publishedSportsFeeScenario(timestamp) {
  if (!Number.isSafeInteger(timestamp) || timestamp < FIRST_WINDOW || timestamp >= LAST_WINDOW_END) {
    throw new Error('Timestamp must be a UTC millisecond within the studied historical windows');
  }
  const prior = timestamp < SPORTS_UPDATE;
  return {
    feeMode: 'polymarket',
    makerFeeRate: 0,
    takerFeeRate: prior ? 0.03 : 0.05,
    makerRebatePoolShare: prior ? 0.25 : 0.15,
    requiresMarketVerification: true,
  };
}
