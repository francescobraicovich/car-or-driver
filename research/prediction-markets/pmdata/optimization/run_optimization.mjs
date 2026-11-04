// Retrospective, data-inspected research only; no historical vintage is attested.
import { readFile } from 'node:fs/promises';
import { adaptWinnerCapture } from '../../portfolio/adapt-pmxt.mjs';
import { replayPortfolio } from '../../portfolio/replay.mjs';
import { replayRaceSeries } from '../../portfolio/race-series.mjs';
import { performanceMetrics, independentLiquidationMetrics, eligibleObjective } from './metrics.mjs';
import { adjustedProbabilities, hillClimb, scoreForecasts } from './search.mjs';

const required = ['--allow-unverified-feed', '--assume-retrospective-vintage', '--assume-closed-time-redemption'];
if (process.argv.length !== required.length + 2 || required.some((flag) => !process.argv.includes(flag))) {
  throw new Error(`Required flags: ${required.join(' ')}`);
}
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const root = 'research/prediction-markets';
const normalized = process.env.PMDATA_NORMALIZED_DIRECTORY ?? 'tmp/pmdata-optimization';
const features = await read(`${root}/pmdata/strategy-features.json`);
const earlierFeatures = await read(`${root}/pmdata/strategy-features-earlier.json`);
const allFeatures = [...earlierFeatures.races, ...features.races];
const preparation = await read(`${normalized}/preparation.json`);
if (!Array.isArray(preparation)) throw new Error('Missing four-driver preparation diagnostics');
const specs = [
  ['canadian', 'Canadian Grand Prix', 'Kimi Antonelli', '2026-05-24T20:00:00Z', 'training'],
  ['monaco', 'Monaco Grand Prix', 'Kimi Antonelli', '2026-06-07T13:00:00Z', 'training'],
  ['barcelona', 'Barcelona Grand Prix', 'Lewis Hamilton', '2026-06-14T13:00:00Z', 'training'],
  ['austrian', 'Austrian Grand Prix', 'George Russell', '2026-06-28T13:00:00Z', 'training'],
  ['british', 'British Grand Prix', 'Charles Leclerc', '2026-07-05T14:00:00Z', 'training'],
  ['belgian', 'Belgian Grand Prix', 'Kimi Antonelli', '2026-07-19T13:00:00Z', 'training'],
  ['hungarian', 'Hungarian Grand Prix', 'Lando Norris', '2026-07-26T13:00:00Z', 'training'],
  ['dutch', 'Dutch Grand Prix', 'Lando Norris', '2026-08-23T13:00:00Z', 'validation'],
  ['italian', 'Italian Grand Prix', 'Kimi Antonelli', '2026-09-06T13:00:00Z', 'pseudo-holdout'],
  ['singapore', 'Singapore Grand Prix', 'Max Verstappen', '2026-10-11T12:00:00Z', 'pseudo-holdout'],
];
const drivers = [['norris', 'Lando Norris'], ['piastri', 'Oscar Piastri'],
  ['hamilton', 'Lewis Hamilton'], ['leclerc', 'Charles Leclerc']];
const fixed = { orderSize: 5, minimumOrderSize: 5, maxInventory: 10, tickSize: 0.01,
  latencyMs: 1000, cancelLatencyMs: 1000, maxBookAgeMs: 60000, maxSourceAgeMs: 120000,
  allowUnverifiedData: true, allowSourceTimestampDisorder: true };
const baseline = { formWeight: 0, teammateWeight: 0, headWeight: 0, minimumEdgeTicks: 1, inventorySkewTicks: 0.1 };
const dimensions = { formWeight: [-1, 0, 1], teammateWeight: [-1, 0, 1], headWeight: [0, 0.5, 1],
  minimumEdgeTicks: [0, 1, 2], inventorySkewTicks: [0, 0.1, 0.5] };
const starts = [baseline, { ...baseline, formWeight: 1 }, { ...baseline, headWeight: 1 },
  { ...baseline, formWeight: 1, teammateWeight: 1, headWeight: 1, minimumEdgeTicks: 0 }];
const races = [], quality = [];
for (const [race, raceName, winner, raceStart, split] of specs) {
  const prepared = preparation.find((item) => item.race === race);
  if (!prepared || !['prepared', 'excluded'].includes(prepared.status)) throw new Error(`Missing preparation status for ${race}`);
  if (prepared.status === 'excluded') {
    quality.push({ race, split, included: false, reason: prepared.reason });
    continue;
  }
  const official = await read(`${root}/pmdata/optimization/${race}-official-outcomes.json`);
  const capture = await read(`${normalized}/${race}-capture.json`);
  const onchain = await read(`${normalized}/${race}-fills.json`);
  const f = allFeatures.find((row) => row.race === raceName);
  if (!f || Date.parse(f.previousRaceDate) >= Date.parse(f.decisionTime)) throw new Error(`Missing or future-dated features for ${race}`);
  const forecast = { description: features.description, results: [{ ...f,
    roster: f.roster.map((driver) => ({ ...driver, probability: driver.baselineProbability })) }] };
  const start = Date.parse(f.decisionTime);
  const winners = official.markets.filter((market) => Number(market.outcomePrices?.[0]) === 1);
  if (winners.length !== 1) throw new Error(`Ambiguous resolved winner for ${race}`);
  try {
    const adapted = adaptWinnerCapture({ capture, official, forecast, onchain, dataThrough: start,
      exitTime: start + 7200000, resolution: { type: 'winner', driver: winner, winnerConditionId: winners[0].conditionId },
      driverSpecs: drivers, allowRoundedVwap: true });
    // This data gate uses one fixed baseline and is applied identically to every candidate.
    replayPortfolio(adapted.input, { ...fixed, ...baseline, initialCapital: 100 });
    const settledAt = Math.max(...official.markets.map((market) => Date.parse(market.closedTime)));
    if (!Number.isFinite(settledAt)) throw new Error('Missing settlement time');
    const inactiveMarkets = prepared.inactiveMarkets ?? [];
    races.push({ race, split, features: f, inactiveMarkets, input: adapted.input, tradingStart: start,
      raceStart: Date.parse(raceStart), raceEnd: settledAt, settledAt, options: {} });
    quality.push({ race, split, included: true, coverageVerified: false,
      inactiveMarkets,
      firstSnapshots: adapted.input.markets.map((market) => ({ driver: market.driver,
        at: inactiveMarkets.some((row) => row.condition === market.id) ? null : new Date(market.coverage.start).toISOString() })),
      ambiguousSameTimeRows: capture.unsequencedSameTimeRows, normalizedEvents: adapted.input.events.length,
      sourceHashes: capture.sources, roundedVwapAssumptions: adapted.provenance.roundedVwapAssumptions });
  } catch (error) { quality.push({ race, split, included: false, reason: error.message }); }
}

function withSignals(entry, parameters, marketOnly = false) {
  const probabilities = marketOnly ? null : adjustedProbabilities(entry.features.roster, parameters);
  const markets = entry.input.markets.map((market) => {
    if (!marketOnly) return { ...market, fairValue: { ...market.fairValue, probability: probabilities.get(market.driver) } };
    // This market has a deliberate empty-book placeholder and cannot place orders.
    if (entry.inactiveMarkets.some((row) => row.condition === market.id)) return { ...market,
      fairValue: { probability: 0, asOf: entry.tradingStart, dataThrough: entry.tradingStart } };
    const first = entry.input.events.find((event) => event.market === market.id && event.type === 'snapshot');
    if (!first || !first.bids.length || !first.asks.length) throw new Error('Market-only benchmark lacks a two-sided first snapshot');
    const bid = Math.max(...first.bids.map(([price]) => price));
    const ask = Math.min(...first.asks.map(([price]) => price));
    if (!(bid > 0 && ask < 1 && bid < ask)) throw new Error('Market-only benchmark has an invalid initial spread');
    return { ...market, fairValue: { probability: (bid + ask) / 2, asOf: first.timestamp, dataThrough: first.timestamp } };
  });
  return { ...entry, input: { ...entry.input, markets } };
}

function runSeries(entries, parameters, marketOnly = false, initialCapital = 100, execution = fixed) {
  if (!entries.length) return { initialCapital, finalCapital: initialCapital, races: [] };
  return replayRaceSeries({ initialCapital, races: entries.map((entry) => withSignals(entry, parameters, marketOnly)) },
    { ...execution, minimumEdgeTicks: parameters.minimumEdgeTicks, inventorySkewTicks: parameters.inventorySkewTicks });
}

function worstSettlement(result) {
  const base = result.cashBeforeSettlement - result.initialCapital;
  const scenarios = [{ winner: 'other', profit: base + result.markets.reduce((sum, market) => sum + market.no, 0) }];
  for (const winner of result.markets) scenarios.push({ winner: winner.driver,
    profit: base + result.markets.reduce((sum, market) => sum + (market.id === winner.id ? market.yes : market.no), 0) });
  return scenarios.reduce((best, next) => next.profit < best.profit ? next : best);
}
function summarize(series, entries) {
  const splitOf = new Map(entries.map((entry) => [entry.input.race, entry.split]));
  const rows = series.races.map((result) => ({ race: result.race, split: splitOf.get(result.race),
    capitalBefore: result.capitalBefore, capitalAfter: result.capitalAfter, profit: result.profit,
    fills: result.fills, worstSettlement: worstSettlement(result) }));
  const bySplit = {};
  for (const split of ['training', 'validation', 'pseudo-holdout']) {
    const selected = rows.filter((row) => row.split === split);
    bySplit[split] = selected.length ? performanceMetrics(selected, selected[0].capitalBefore) : null;
  }
  return { overall: performanceMetrics(rows), bySplit, races: rows };
}

const training = races.filter((entry) => entry.split === 'training');
const trainingCache = new Map();
const evaluateTraining = (parameters) => {
  const key = JSON.stringify(parameters);
  if (!trainingCache.has(key)) {
    try { trainingCache.set(key, performanceMetrics(runSeries(training, parameters).races)); }
    catch (error) { trainingCache.set(key, { races: 0, tradedRaces: 0, sharpePerRace: null, invalid: error.message }); }
  }
  return trainingCache.get(key);
};
// Every objective is selected using training only, before any selected model is evaluated later.
const objectiveNames = ['sharpePerRace', 'sortinoPerRace', 'profitFactor', 'returnToSettledDrawdown'];
const searches = Object.fromEntries(objectiveNames.map((name) => [name, hillClimb(evaluateTraining, dimensions, starts, 4, name)]));
const search = searches.sharpePerRace;
const output = { classification: 'retrospective conditional sensitivity; pseudo-holdouts were inspected before this study',
  splitDefinition: { training: specs.filter((row) => row[4] === 'training').map((row) => row[0]),
    validation: ['dutch'], pseudoHoldout: ['italian', 'singapore'], selectionUses: 'training only' },
  executionAssumptions: { ...fixed, sourceAgeNote: '120 seconds was selected after inspecting earlier data',
    quoteGridNote: '0.01 is a coarse quote grid; historical venue tick is not established for every market',
    priceReconciliation: 'rounded VWAP is an opt-in assumption only when maker legs and on-chain summary agree exactly',
    bookCoverageVerified: false, fillNotification: 'immediate at print receipt', makerFees: 0, makerRebates: 0,
    tradeThroughFills: 'not modeled', settlement: 'Gamma closedTime and immediate redemption assumed',
    liquidation: 'Independent $100 per race; one-cent adverse slippage; category coefficient 0.03 before July 10, 0.05 afterward; actual fee eligibility, builder fees and gas unverified',
    forecastVintageVerified: false },
  dataQuality: quality, dimensions, starts, search,
  additionalObjectiveSearches: Object.fromEntries(objectiveNames.slice(1).map((name) => [name, searches[name]])),
  objectiveSearchCounts: { perMetric: Object.fromEntries(objectiveNames.map((name) => [name, searches[name].trials.length])),
    distinctAcrossAllMetrics: trainingCache.size },
  distinctTrainingTrials: [...trainingCache.entries()].map(([key, training]) => ({ parameters: JSON.parse(key), training,
    eligibleObjectives: Object.fromEntries(objectiveNames.map((name) => [name, eligibleObjective(training, name)])) })) };
output.trainingMetricLeaders = Object.fromEntries(objectiveNames.map((name) => {
  const ranked = output.distinctTrainingTrials.filter((trial) => trial.training.tradedRaces >= 2 && Number.isFinite(trial.training[name]))
    .sort((a, b) => b.training[name] - a.training[name]);
  return [name, ranked.length ? { parameters: ranked[0].parameters, value: ranked[0].training[name],
    note: 'Training-only descriptive leader across the union of evaluated paths; not an additional holdout selection.' } : null];
}));
const evaluateAll = (parameters, marketOnly = false, execution = fixed) => summarize(runSeries(races, parameters, marketOnly, 100, execution), races);
const noTradeRows = races.map((entry) => ({ split: entry.split, capitalBefore: 100, capitalAfter: 100, fills: [] }));
const noTradeSplits = Object.fromEntries(['training', 'validation', 'pseudo-holdout'].map((split) => {
  const rows = noTradeRows.filter((row) => row.split === split);
  return [split, rows.length ? performanceMetrics(rows) : null];
}));
output.baselines = { noTrade: { overall: performanceMetrics(noTradeRows), bySplit: noTradeSplits },
  modelWithoutAdjustments: evaluateAll(baseline) };
output.baselinePredictiveScores = scoreForecasts(races, baseline);
try { output.baselines.marketOnlyFirstBookMidpoint = evaluateAll(baseline, true); }
catch (error) { output.baselines.marketOnlyFirstBookMidpoint = { unavailable: error.message }; }
if (search.selected) {
  output.selected = evaluateAll(search.selected.parameters);
  output.selectedPredictiveScores = scoreForecasts(races, search.selected.parameters);
  try {
    output.selectedLatencySensitivity = { submissionLatencyMs: 3000, cancellationLatencyMs: 3000,
      note: 'Frozen Sharpe-selected strategy; no retuning, all common eligible races retained',
      evaluation: evaluateAll(search.selected.parameters, false, { ...fixed, latencyMs: 3000, cancelLatencyMs: 3000 }) };
  } catch (error) {
    output.selectedLatencySensitivity = { submissionLatencyMs: 3000, cancellationLatencyMs: 3000,
      available: false, reason: error.message };
  }
  output.selectedLiquidation = races.map((entry) => {
    const input = withSignals(entry, search.selected.parameters).input;
    const takerFeeRate = entry.tradingStart < Date.parse('2026-07-10T00:00:00Z') ? 0.03 : 0.05;
    try {
      const result = replayPortfolio(input, { ...fixed, ...search.selected.parameters, initialCapital: 100,
        exitMode: 'liquidation', takerFeeRate });
      return { race: entry.race, split: entry.split, complete: result.complete, profit: result.profit, fees: result.fees, fills: result.fills };
    } catch (error) { return { race: entry.race, split: entry.split, complete: false, profit: null, reason: error.message }; }
  });
  output.selectedLiquidationMetrics = Object.fromEntries(['training', 'validation', 'pseudo-holdout'].map((split) => [split,
    independentLiquidationMetrics(output.selectedLiquidation.filter((row) => row.split === split))]));
} else output.selected = null;
output.additionalSelectedEvaluations = Object.fromEntries(objectiveNames.slice(1).map((name) => {
  const selected = searches[name].selected;
  return [name, selected ? { parameters: selected.parameters, trainingObjective: selected.objective,
    evaluation: evaluateAll(selected.parameters), predictiveScores: scoreForecasts(races, selected.parameters),
    note: 'Weights frozen from training only before evaluating the previously inspected pseudo-holdout.' } : null];
}));
console.log(JSON.stringify(output, null, 2));
