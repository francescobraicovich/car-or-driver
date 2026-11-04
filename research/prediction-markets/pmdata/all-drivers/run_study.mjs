// Historical feed and model vintages are unverified. Never submit live orders.
import { readFile } from 'node:fs/promises';
import { adaptWinnerCapture } from '../../portfolio/adapt-pmxt.mjs';
import { replayPortfolio } from '../../portfolio/replay.mjs';
import { adjustedProbabilities } from '../optimization/search.mjs';
import { runFlatSeries, selectTrainingCandidates, summarizeFlatSeries } from './optimization.mjs';

const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== '--conditional-research') throw new Error('Supply --conditional-research to acknowledge unverified data and execution');
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const base = 'research/prediction-markets/pmdata';
const directory = process.env.PMDATA_ALL_NORMALIZED_DIRECTORY ?? 'tmp/pmdata-all-normalized-v2';
const manifest = await read(`${base}/all-drivers/manifest.json`);
const preparation = await read(`${directory}/preparation.json`);
const midnight = await read(`${base}/strategy-features-midnight.json`);
const early = await read(`${base}/all-drivers/earlier-midnight-features.json`);
const features = [...early.races, ...midnight.races];
const split = { canadian: 'training', monaco: 'training', barcelona: 'training', austrian: 'training', british: 'training',
  dutch: 'validation', italian: 'pseudo-holdout', singapore: 'pseudo-holdout' };
const fixed = { initialCapital: 3000, orderSize: 5, minimumOrderSize: 5, maxInventory: 10, tickSize: 0.01,
  latencyMs: 1000, cancelLatencyMs: 1000, maxBookAgeMs: 60000, maxSourceAgeMs: 120000,
  liquidationSlippageTicks: 1, exitMode: 'liquidation', allowUnverifiedData: true,
  allowSourceTimestampDisorder: true, tradeThroughFills: true };
const dimensions = { formWeight: [-1, 0, 1], teammateWeight: [-1, 0, 1], headWeight: [0, 1],
  minimumEdgeTicks: [0, 1], inventorySkewTicks: [0, 0.1], quoteImprovementTicks: [0, 1], marketMidpointWeight: [0, 0.5, 1] };
const seed = { formWeight: 0, teammateWeight: 0, headWeight: 0, minimumEdgeTicks: 0, inventorySkewTicks: 0.1,
  quoteImprovementTicks: 1, marketMidpointWeight: 0 };
const accepted = [], dataQuality = [];
for (const item of manifest.races) {
  if (!split[item.id]) continue;
  const detail = { race: item.id, split: split[item.id], rosterSize: item.drivers.length, markets: [] };
  const prepared = preparation.find((row) => row.race === item.id);
  const f = features.find((row) => row.race === item.name);
  if (!prepared || !f || Date.parse(f.previousRaceDate) >= Date.parse(f.decisionTime) ||
      !f.decisionTime.endsWith('T00:00:00.000Z')) throw new Error(`Missing prior-day midnight features or preparation for ${item.id}`);
  const fourDriverOfficial = await read(`${base}/optimization/${item.id}-official-outcomes.json`);
  const allMarkets = [...item.drivers.map((driver) => driver.market).filter(Boolean), ...fourDriverOfficial.markets];
  const official = { ...fourDriverOfficial, markets: [...new Map(allMarkets.map((market) => [market.conditionId, market])).values()] };
  const winners = official.markets.filter((market) => Number(market.outcomePrices?.[0]) === 1);
  if (winners.length !== 1) throw new Error(`No unique verified historical winner in ${item.id} metadata`);
  const winningDriver = item.drivers.find((driver) => driver.market?.conditionId === winners[0].conditionId);
  const fallbackSurname = winners[0].slug.match(/winner-(.+?)-\d{4}-\d{2}-\d{2}$/)?.[1];
  if (!winningDriver && !fallbackSurname) throw new Error('Cannot identify winner for adapter payout verification');
  // The adapter validates payouts, but liquidation neither reads nor needs the outcome.
  const resolution = { type: 'winner', driver: winningDriver?.name ?? fallbackSurname,
    winnerConditionId: winners[0].conditionId };
  const start = Date.parse(f.decisionTime), exitTime = start + 86400000 - 1;
  const forecast = { description: midnight.description, results: [{ ...f,
    roster: f.roster.map((driver) => ({ ...driver, probability: driver.baselineProbability })) }] };
  const markets = [], events = [];
  for (const driver of item.drivers) {
    const state = prepared.drivers.find((row) => row.driverId === driver.driverId);
    if (!state || state.status !== 'prepared') {
      detail.markets.push({ driver: driver.name, active: false, reason: state?.reason ?? 'No preparation record' });
      continue;
    }
    if (item.id === 'barcelona' && driver.name === 'Charles Leclerc') {
      detail.markets.push({ driver: driver.name, active: false, reason: 'Previously documented missing chain transaction in trade tape' });
      continue;
    }
    try {
      const capture = await read(state.capture), onchain = await read(state.fills);
      const slug = driver.market.slug.match(/winner-(.+?)-\d{4}-\d{2}-\d{2}$/)?.[1];
      if (!slug) throw new Error('Unrecognized market slug');
      const adapted = adaptWinnerCapture({ capture, official, forecast, onchain, dataThrough: start, exitTime, resolution,
        driverSpecs: [[slug, driver.name]], allowRoundedVwap: true });
      // A fixed, per-market quality gate runs without orders or use of outcomes.
      // It applies to every candidate and benchmark before any search.
      replayPortfolio(adapted.input, { ...fixed, minimumEdgeTicks: 100, inventorySkewTicks: 0,
        quoteImprovementTicks: 0, takerFeeRate: start < Date.parse('2026-07-10T00:00:00Z') ? 0.03 : 0.05 });
      markets.push(adapted.input.markets[0]); events.push(...adapted.input.events);
      detail.markets.push({ driver: driver.name, active: true, firstSnapshot: adapted.input.markets[0].coverage.start,
        events: adapted.input.events.length, recordedPrints: state.prints, tradeFileStatus: state.tradeFileStatus,
        unsequencedSameTimeRows: state.unsequencedSameTimeRows, excludedBoundarySnapshots: state.excludedBoundarySnapshots,
        roundedVwapAssumptions: adapted.provenance.roundedVwapAssumptions.length });
    } catch (error) { detail.markets.push({ driver: driver.name, active: false, reason: error.message }); }
  }
  events.sort((a, b) => a.timestampUs - b.timestampUs);
  detail.activeMarkets = markets.length;
  detail.requestedMarkets = item.drivers.length;
  console.error(`${item.id}: ${markets.length}/${item.drivers.length} eligible markets; ${events.length} events`);
  if (markets.length) accepted.push({ race: item.id, split: split[item.id], features: f, tradingStart: start,
    input: { race: item.name, firstPractice: Date.parse(f.firstPractice), exitTime, markets, events } });
  dataQuality.push(detail);
}

const common = ['canadian', 'monaco', 'barcelona', 'austrian', 'british'];
const training = accepted.filter((row) => row.split === 'training');
function firstUsableMidpoints(entry) {
  if (entry.initialMidpoints) return entry.initialMidpoints;
  const states = new Map(entry.input.markets.map((market) => [market.id, { buy: new Map(), sell: new Map(), mid: null, hasSnapshot: false }]));
  let remaining = states.size;
  for (const event of entry.input.events) {
    const state = states.get(event.market);
    if (state.mid !== null) continue;
    if (event.type === 'snapshot') {
      state.buy = new Map(event.bids.filter(([, size]) => size > 0));
      state.sell = new Map(event.asks.filter(([, size]) => size > 0));
      state.hasSnapshot = true;
    } else if (event.type === 'update') {
      if (!state.hasSnapshot) continue;
      if (event.quantity > 0) state[event.side].set(event.price, event.quantity);
      else state[event.side].delete(event.price);
    } else continue;
    if (state.buy.size && state.sell.size) {
      const bid = Math.max(...state.buy.keys()), ask = Math.min(...state.sell.keys());
      if (bid > 0 && ask < 1 && bid < ask) {
        state.mid = (bid + ask) / 2; state.timestamp = event.timestamp;
        if (--remaining === 0) break;
      }
    }
  }
  if (remaining) throw new Error(`${remaining} eligible markets never form a usable two-sided book for the market benchmark`);
  const rows = entry.input.markets.map((market) => states.get(market.id));
  const availableAt = Math.max(...rows.map((row) => row.timestamp));
  const scale = Math.max(1, rows.reduce((sum, row) => sum + row.mid, 0));
  entry.initialMidpoints = { values: rows.map((row) => row.mid / scale), availableAt,
    oldestPriceAgeMs: availableAt - Math.min(...rows.map((row) => row.timestamp)) };
  return entry.initialMidpoints;
}
function withSignals(entry, parameters, useMarket = false) {
  const probabilities = adjustedProbabilities(entry.features.roster, parameters);
  let mids = null, availableAt = entry.tradingStart;
  if (useMarket) {
    const initial = firstUsableMidpoints(entry);
    mids = initial.values; availableAt = initial.availableAt;
  }
  return { ...entry.input, markets: entry.input.markets.map((market, index) => ({ ...market,
    fairValue: { probability: useMarket === true ? mids[index] : probabilities.get(market.driver),
      asOf: useMarket ? availableAt : entry.tradingStart, dataThrough: useMarket === true ? availableAt : entry.tradingStart } })) };
}
function evaluate(entries, parameters, execution = {}, useMarket = false) {
  try {
    const series = runFlatSeries(entries, (entry, capital) => {
      const input = withSignals(entry, parameters, useMarket);
      if (execution.completeSetsPerMarket !== undefined) {
        input.markets = input.markets.map((market) => ({ ...market, initialCompleteSets: execution.completeSetsPerMarket }));
      }
      return replayPortfolio(input, { ...fixed, ...parameters, ...execution, initialCapital: capital,
        liquidationStartTime: input.exitTime - 3600000 + 1,
        takerFeeRate: entry.tradingStart < Date.parse('2026-07-10T00:00:00Z') ? 0.03 : 0.05 });
    });
    if (series.races.length !== entries.length) return { available: false, reason: 'Replay ended before all requested races were closed', races: series.races };
    const bySplit = Object.fromEntries(['training', 'validation', 'pseudo-holdout'].map((name) => {
      const rows = series.races.filter((row) => row.split === name);
      const requested = Object.values(split).filter((value) => value === name).length;
      if (entries === accepted && rows.length !== requested) return [name,
        { available: false, reason: `Only ${rows.length} of ${requested} requested races passed the fixed data gate` }];
      return [name, rows.length ? summarizeFlatSeries(rows, rows[0].capitalBefore) : { available: false, reason: 'No races in split' }];
    }));
    const metrics = { ...summarizeFlatSeries(series.races), bySplit, races: series.races,
      peakCapitalCommitted: Math.max(0, ...series.races.map((row) => row.peakCapitalCommitted ?? 0)),
      peakReservedCash: Math.max(0, ...series.races.map((row) => row.peakReservedCash ?? 0)) };
    if (entries === accepted && accepted.length !== Object.keys(split).length) return { available: false,
      reason: `${Object.keys(split).length - accepted.length} requested races did not pass the fixed data gate`,
      conditionalAvailableRaces: metrics };
    return metrics;
  } catch (error) { return { available: false, reason: error.message }; }
}
function evaluateWithDiagnostics(entries, parameters, execution = {}, useMarket = false) {
  const continuous = evaluate(entries, parameters, execution, useMarket);
  if (continuous.available) return { continuous };
  return { continuous, independentRaceDiagnostics: entries.map((entry) => ({ race: entry.race, split: entry.split,
    note: 'Hypothetical $3,000 reset for this race only; not a continuous portfolio',
    evaluation: evaluate([entry], parameters, execution, useMarket) })) };
}
// Only the fixed five training windows may influence selection. Failing an
// input gate never turns a missing race into a zero-return observation.
const enoughTraining = common.every((race) => training.some((entry) => entry.race === race));
const search = enoughTraining ? selectTrainingCandidates((parameters) => {
  console.error(`training trial: ${JSON.stringify(parameters)}`);
  const evaluation = evaluate(training, parameters);
  // Keep the race summary, but do not duplicate every fill in each trial.
  const { races, ...metrics } = evaluation;
  return { ...metrics, raceResults: races?.map((row) => ({ race: row.race, complete: row.complete, profit: row.profit,
    makerFills: row.fills.filter((fill) => fill.kind === 'maker').length })) };
}, dimensions, seed, { maxPasses: 2 }) : null;
const report = { classification: 'Conditional historical replay; sample, feed, queue position and model vintages are unverified',
  splitDefinition: { training: common, validation: ['dutch'], pseudoHoldout: ['italian', 'singapore'],
    note: 'Only training selects the candidate, but related prior analyses examined these races; later races are not untouched.' },
  assumptions: { ...fixed, feeRate: '0.03 before 10 July 2026 and 0.05 afterward, category assumptions not contract-level verification',
    liquidationStart: '23:00 UTC; stop quoting, cancel, and attempt to close on subsequent usable books until 23:59:59.999 UTC',
    completeSets: 'five per eligible market funded at $1 each and immediately merged after flattening; merge cost and delay omitted',
    baseline: 'first reconstructed two-sided book midpoints normalized only if their sum exceeds 1; all become available at the latest initial midpoint time. The aligned model baseline starts at the same time.',
    dynamicFairValue: 'The observed current book midpoint is blended with the prior-day model score at each quote decision; individual blended values need not sum to one.',
    marketData: 'midnight boundary books excluded; prior feed continuity, exchange sequencing and queue positions are not attested; market eligibility uses the full day and is a retrospective complete-case filter, not an ex-ante tradable rule',
    forecast: 'prior calendar days only; retrospective model and historical input revisions lack vintage proof',
    target: 'Sharpe annualization is illustrative only, not evidence of a robust strategy' },
  dataQuality, trainingComplete: enoughTraining, dimensions, seed, search,
  baseline: evaluateWithDiagnostics(accepted, seed), marketBaseline: evaluateWithDiagnostics(accepted, seed, {}, true),
  alignedModelBaseline: evaluateWithDiagnostics(accepted, seed, {}, 'aligned-model'),
  dynamicMidpointBaseline: evaluateWithDiagnostics(accepted, { ...seed, marketMidpointWeight: 1 }),
  selectedControlsMidpointBaseline: search?.selected ? evaluateWithDiagnostics(accepted,
    { ...search.selected.parameters, marketMidpointWeight: 1 }) : null,
  selected: search?.selected ? evaluateWithDiagnostics(accepted, search.selected.parameters) : null,
  executionSensitivity: search?.selected ? evaluateWithDiagnostics(accepted, search.selected.parameters, { tradeThroughFills: false }) : null,
  latencySensitivity: search?.selected ? evaluateWithDiagnostics(accepted, search.selected.parameters,
    { latencyMs: 3000, cancelLatencyMs: 3000 }) : null,
  sizingSensitivity: search?.selected ? Object.fromEntries([10, 25, 50].map((size) => [size,
    evaluateWithDiagnostics(accepted, search.selected.parameters, { orderSize: size, maxInventory: size * 2, completeSetsPerMarket: size })])) : null,
  noTradeBaseline: { initialCapital: 3000, finalCapital: 3000, profit: 0, makerFills: 0, liquidationFills: 0,
    sharpePerRace: null, bySplit: Object.fromEntries(['training', 'validation', 'pseudo-holdout'].map((name) => [name,
      { races: Object.values(split).filter((value) => value === name).length, profit: 0, fills: 0, sharpePerRace: null }])),
    note: 'No trades; ratios with zero denominators are undefined.' } };
report.marketBenchmarkTiming = accepted.map((entry) => {
  try { const value = firstUsableMidpoints(entry); return { race: entry.race, availableAt: value.availableAt,
    oldestInitialMidpointAgeMs: value.oldestPriceAgeMs }; }
  catch (error) { return { race: entry.race, unavailable: error.message }; }
});
console.log(JSON.stringify(report, null, 2));
