import { performanceMetrics } from '../optimization/metrics.mjs';

const EPSILON = 1e-7;

/** Summarize only races closed to cash; an incomplete exit invalidates the series. */
export function summarizeFlatSeries(rows, initialCapital = 3000, slippagePerShare = 0.01) {
  if (!Array.isArray(rows) || !Number.isFinite(initialCapital) || initialCapital <= 0 ||
      !Number.isFinite(slippagePerShare) || slippagePerShare < 0) throw new Error('Invalid series inputs');
  if (!rows.length) return { available: false, reason: 'No races in split' };
  const failure = rows.find((row) => row.complete !== true || !Number.isFinite(row.profit) ||
    !Array.isArray(row.fills) || !Array.isArray(row.markets) ||
    row.markets.some((market) => !Number.isFinite(market.inventory) || Math.abs(market.inventory) > EPSILON));
  if (failure) return { available: false, reason: `Incomplete exit in ${failure.race}` };
  let capital = initialCapital, makerFills = 0, liquidationFills = 0, makerShares = 0, liquidationShares = 0;
  let fees = 0, slippage = 0, netTradingCash = 0, matchedShares = 0, makerMatchedShares = 0, tradedRaces = 0, tradeThroughFills = 0;
  const tradedMarkets = new Set();
  const accounting = [];
  for (const row of rows) {
    const positions = new Map();
    let raceTradingCash = 0, raceFees = 0, raceSlippage = 0, raceMakerFills = 0;
    for (const fill of row.fills) {
      if (!['maker', 'liquidation'].includes(fill.kind) || !['buy', 'sell'].includes(fill.side) ||
          typeof fill.market !== 'string' || !Number.isFinite(fill.quantity) || fill.quantity <= 0 ||
          !Number.isFinite(fill.price) || fill.price <= 0 || fill.price >= 1 ||
          !Number.isFinite(fill.fee) || fill.fee < 0) throw new Error('Invalid fill');
      const signedShares = (fill.side === 'buy' ? 1 : -1) * fill.quantity;
      const sideCash = -signedShares * fill.price;
      const position = positions.get(fill.market) ?? { buy: 0, sell: 0, makerBuy: 0, makerSell: 0 };
      position[fill.side] += fill.quantity;
      if (fill.kind === 'maker') position[fill.side === 'buy' ? 'makerBuy' : 'makerSell'] += fill.quantity;
      positions.set(fill.market, position);
      raceTradingCash += sideCash; raceFees += fill.fee;
      if (fill.kind === 'maker') {
        makerFills++; raceMakerFills++; makerShares += fill.quantity;
        tradedMarkets.add(`${row.race}|${fill.market}`);
        if (fill.tradeThrough === true) tradeThroughFills++;
      }
      else {
        liquidationFills++; liquidationShares += fill.quantity;
        if (fill.slippageCost !== undefined && (!Number.isFinite(fill.slippageCost) || fill.slippageCost < 0)) throw new Error('Invalid liquidation slippage');
        raceSlippage += fill.slippageCost ?? fill.quantity * slippagePerShare;
      }
    }
    for (const position of positions.values()) {
      if (Math.abs(position.buy - position.sell) > EPSILON) throw new Error('Fills are inconsistent with a flat position');
      matchedShares += Math.min(position.buy, position.sell);
      makerMatchedShares += Math.min(position.makerBuy, position.makerSell);
    }
    if (Math.abs(raceTradingCash - raceFees - row.profit) > EPSILON) throw new Error('Cash profit disagrees with recorded fills');
    if (raceMakerFills) tradedRaces++;
    netTradingCash += raceTradingCash; fees += raceFees; slippage += raceSlippage;
    const after = capital + row.profit;
    accounting.push({ capitalBefore: capital, capitalAfter: after, fills: row.fills });
    capital = after;
  }
  const metrics = performanceMetrics(accounting, initialCapital);
  return { available: true, ...metrics, tradedRaces, tradedMarketRaces: tradedMarkets.size,
    makerFills, tradeThroughFills, makerShares, liquidationFills, liquidationShares,
    matchedShares, makerMatchedShares, fees, assumedSlippageCost: slippage,
    grossCashBeforeFeesAndAssumedSlippage: netTradingCash + slippage,
    illustrativeAnnualizedSharpe: metrics.sharpePerRace === null ? null : metrics.sharpePerRace * Math.sqrt(24),
    annualizationNote: 'Illustrative only: 24 independent and comparable race periods per year; returns use one shared cash balance. Not validated with this sample.',
    grossCashNote: 'Cash from paired fills before assumed adverse liquidation slippage and fees, including price movement; not a pure earned spread.' };
}

/** Carry cash between non-overlapping flat-to-cash race replays. */
export function runFlatSeries(entries, runRace, initialCapital = 3000) {
  if (!Array.isArray(entries) || typeof runRace !== 'function' || !Number.isFinite(initialCapital) || initialCapital <= 0) {
    throw new Error('Invalid chronological replay inputs');
  }
  let capital = initialCapital, previousExit = -Infinity;
  const rows = [];
  for (const entry of entries) {
    if (!Number.isFinite(entry.tradingStart) || !Number.isFinite(entry.input?.exitTime) ||
        entry.tradingStart <= previousExit || entry.input.exitTime <= entry.tradingStart) throw new Error('Race windows must be ordered and non-overlapping');
    const result = runRace(entry, capital);
    if (!result || result.exitMode !== 'liquidation') throw new Error('Only pre-practice liquidation replays are permitted');
    rows.push({ ...result, split: entry.split, capitalBefore: capital,
      capitalAfter: result.complete === true && Number.isFinite(result.profit) ? capital + result.profit : null });
    if (result.complete !== true || !Number.isFinite(result.profit)) break;
    capital += result.profit;
    if (capital <= 0) break;
    previousExit = entry.input.exitTime;
  }
  return { initialCapital, finalCapital: rows.length === entries.length && rows.every((row) => row.capitalAfter !== null && row.capitalAfter > 0) ? capital : null,
    requestedRaces: entries.length, races: rows };
}

/** Rank training candidates only; the fixed activity floor prevents an inactive winner. */
export function selectTrainingCandidates(evaluate, dimensions, seed, options = {}) {
  const { minimumMakerFills = 10, minimumTradedRaces = 3, maxPasses = 1 } = options;
  if (typeof evaluate !== 'function' || !dimensions || typeof dimensions !== 'object' || !seed ||
      !Number.isInteger(minimumMakerFills) || minimumMakerFills < 1 || !Number.isInteger(minimumTradedRaces) || minimumTradedRaces < 2 ||
      !Number.isInteger(maxPasses) || maxPasses < 1) throw new Error('Invalid search inputs');
  const names = Object.keys(dimensions);
  if (!names.length || names.some((name) => !Array.isArray(dimensions[name]) || !dimensions[name].length || !dimensions[name].includes(seed[name]))) {
    throw new Error('Invalid search grid or seed');
  }
  const trials = new Map();
  const evaluateOnce = (candidate) => {
    if (names.some((name) => !dimensions[name].includes(candidate[name]))) throw new Error('Candidate outside search grid');
    const parameters = Object.fromEntries(names.map((name) => [name, candidate[name]]));
    const key = JSON.stringify(parameters);
    if (!trials.has(key)) {
      const training = evaluate(parameters);
      const objective = training.available === true && training.makerFills >= minimumMakerFills &&
        training.tradedRaces >= minimumTradedRaces && Number.isFinite(training.sharpePerRace) ? training.sharpePerRace : null;
      trials.set(key, { parameters, training, objective });
    }
    return trials.get(key);
  };
  const better = (candidate, current) => {
    if (candidate.objective !== null || current.objective !== null) {
      return candidate.objective !== null && (current.objective === null || candidate.objective > current.objective + 1e-12);
    }
    // Training-only feasibility exploration when no candidate meets the activity floor.
    const a = candidate.training, b = current.training;
    if (a.available !== b.available) return a.available === true;
    if (a.tradedRaces !== b.tradedRaces) return (a.tradedRaces ?? 0) > (b.tradedRaces ?? 0);
    return (a.makerFills ?? 0) > (b.makerFills ?? 0);
  };
  let current = evaluateOnce(seed);
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const name of names) {
      let best = current;
      for (const value of dimensions[name]) {
        const candidate = evaluateOnce({ ...current.parameters, [name]: value });
        if (better(candidate, best)) best = candidate;
      }
      if (best !== current) { current = best; changed = true; }
    }
    if (!changed) break;
  }
  return { selected: current.objective === null ? null : current, trials: [...trials.values()],
    minimumMakerFills, minimumTradedRaces, maxPasses };
}
