import { replayPortfolio } from './replay.mjs';

/** Compound settlement cash only across races whose settlement precedes the next trading window. */
export function replayRaceSeries({ initialCapital, races }, commonOptions = {}) {
  if (typeof initialCapital !== 'number' || !Number.isFinite(initialCapital) || initialCapital < 0 || !Array.isArray(races) || !races.length) {
    throw new Error('A finite initial capital and nonempty race series are required');
  }
  let previousSettlement = -1;
  for (const entry of races) {
    const { input, tradingStart, raceStart, raceEnd, settledAt } = entry;
    if (!input || !Number.isFinite(tradingStart) || !Number.isFinite(raceStart) || !Number.isFinite(raceEnd) || !Number.isFinite(settledAt) ||
        tradingStart > input.exitTime || raceStart <= input.firstPractice || raceEnd < raceStart || settledAt < raceEnd ||
        !Array.isArray(input.events) || input.events.some((event) => event.timestamp < tradingStart)) {
      throw new Error('A valid trading start and recorded settlement time are required');
    }
    if (tradingStart < previousSettlement) throw new Error('Overlapping unsettled races require a cross-race collateral scheduler');
    if (entry.options && (Object.hasOwn(entry.options, 'initialCapital') || Object.hasOwn(entry.options, 'exitMode') || Object.hasOwn(entry.options, 'allowUnverifiedData'))) {
      throw new Error('Race options cannot override series capital, settlement mode or coverage policy');
    }
    previousSettlement = settledAt;
  }
  let capital = initialCapital;
  const results = [];
  for (const entry of races) {
    const before = capital;
    const result = replayPortfolio(entry.input, { ...commonOptions, ...entry.options, initialCapital: before, exitMode: 'settlement' });
    if (!result.complete || result.profit === null) throw new Error('Race must finish with complete settlement accounting');
    capital = result.cashBeforeSettlement + result.settlementCash;
    results.push({ tradingStart: entry.tradingStart, raceStart: entry.raceStart, raceEnd: entry.raceEnd,
      settledAt: entry.settledAt, capitalBefore: before, capitalAfter: capital, ...result });
  }
  return { dataClassification: results.every((result) => result.coverageAttested && result.sourceTimestampOrderEnforced && result.crossedBookIntervals.length === 0)
    ? 'coverage attested; execution and signal assumptions unverified'
    : 'conditional sensitivity: unverified coverage',
  warning: 'Non-overlapping races only; settlements, fee eligibility, inputs and execution remain caller-verified assumptions.',
  initialCapital, finalCapital: capital, profit: capital - initialCapital, races: results };
}
