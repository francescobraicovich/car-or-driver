// Retrospective post-selection sensitivity; no feed coverage is certified.
import { readFile } from 'node:fs/promises';
import { adaptWinnerCapture } from '../../portfolio/adapt-pmxt.mjs';
import { replayPortfolio } from '../../portfolio/replay.mjs';
import { replayRaceSeries } from '../../portfolio/race-series.mjs';
import { filterBoundaryBooks } from './filter_boundary_books.mjs';

const args = process.argv.slice(2);
const required = ['--allow-unverified-feed', '--assume-retrospective-vintage', '--assume-closed-time-redemption'];
const relaxed = args.includes('--allow-240-second-source-age');
const allowed = [...required, ...(relaxed ? ['--allow-240-second-source-age'] : [])];
if (args.length !== allowed.length || allowed.some((flag) => !args.includes(flag))) {
  throw new Error(`Required: ${required.join(' ')} [--allow-240-second-source-age]`);
}
const read = async (file) => JSON.parse(await readFile(file, 'utf8'));
const directory = process.env.PMDATA_NORMALIZED_DIRECTORY ?? 'tmp/pmdata/full-window';
const rejections = await read(`${directory}/rejections.json`);
const specs = [
  ['austrian', 'George Russell', '2026-06-28T13:00:00Z'],
  ['british', 'Charles Leclerc', '2026-07-05T14:00:00Z'],
  ['belgian', 'Kimi Antonelli', '2026-07-19T13:00:00Z'],
  ['hungarian', 'Lando Norris', '2026-07-26T13:00:00Z'],
  ['dutch', 'Lando Norris', '2026-08-23T13:00:00Z'],
  ['italian', 'Kimi Antonelli', '2026-09-06T13:00:00Z'],
  ['singapore', 'Max Verstappen', '2026-10-11T12:00:00Z'],
];
const options = { initialCapital: 100, orderSize: 5, minimumOrderSize: 5, maxInventory: 10, tickSize: 0.01,
  latencyMs: 1000, cancelLatencyMs: 1000, maxBookAgeMs: 60000, maxSourceAgeMs: relaxed ? 240000 : 60000,
  minimumEdgeTicks: 1, inventorySkewTicks: 0.1, allowUnverifiedData: true, allowSourceTimestampDisorder: true };
const details = [], accepted = [];
for (const [race, winner, raceStart] of specs) {
  if (Object.hasOwn(rejections, race)) { details.push({ race, conditionalRejection: rejections[race] }); continue; }
  const prefix = 'research/prediction-markets';
  const capture = await read(`${directory}/${race}-capture.json`);
  const onchain = await read(`${directory}/${race}-fills.json`);
  const official = await read(`${prefix}/polymarket/${race}-2026-official-outcomes.json`);
  const forecast = await read(`${prefix}/pmdata/full-window/${race}-forecast.json`);
  const start = Date.parse(forecast.results[0].decisionTime);
  if (new Date(start).toISOString().slice(11) !== '00:00:00.000Z') throw new Error(`${race} forecast is not a midnight decision`);
  const filtered = filterBoundaryBooks(capture.rows, start);
  capture.rows = filtered.rows;
  const exactMidnightBooksExcluded = filtered.excluded;
  const matches = official.markets.filter((market) => Number(market.outcomePrices?.[0]) === 1);
  if (matches.length !== 1) throw new Error(`${race} lacks a unique official winner`);
  const settlement = Math.max(...official.markets.map((market) => Date.parse(market.closedTime)));
  const detail = { race, outcome: winner, exactMidnightBooksExcluded,
    windowStart: new Date(start).toISOString(), windowEnd: new Date(start + 57600000).toISOString(),
    unsequencedSameTimeRows: capture.unsequencedSameTimeRows, sourceHashes: capture.sources,
    conditionalRejection: null, strictRejection: null };
  try {
    const adapted = adaptWinnerCapture({ capture, official, forecast, onchain, dataThrough: start,
      exitTime: start + 57600000, resolution: { type: 'winner', driver: winner, winnerConditionId: matches[0].conditionId } });
    detail.firstSnapshots = adapted.input.markets.map((market) => ({ driver: market.driver,
      timestamp: new Date(market.coverage.start).toISOString(), timestampUs: Math.round(market.coverage.start * 1000) }));
    detail.normalizedEvents = adapted.input.events.length;
    detail.normalizedTradeLegs = adapted.input.events.filter((event) => event.type === 'trade').length;
    detail.droppedAtInitialTimestamp = adapted.provenance.droppedAtInitialTimestamp;
    try { replayPortfolio(adapted.input, { ...options, allowUnverifiedData: false, allowSourceTimestampDisorder: false }); }
    catch (error) { detail.strictRejection = error.message; }
    if (!detail.strictRejection) throw new Error(`${race} unexpectedly accepted without data coverage`);
    const takerFeeRate = start < Date.parse('2026-07-10T00:00:00Z') ? 0.03 : 0.05;
    detail.assumedSportsTakerCoefficient = takerFeeRate;
    detail.independentSettlementSensitivity = replayPortfolio(adapted.input, { ...options, takerFeeRate });
    detail.independentLiquidationSensitivity = replayPortfolio(adapted.input, { ...options, takerFeeRate, exitMode: 'liquidation' });
    accepted.push({ input: adapted.input, tradingStart: start, raceStart: Date.parse(raceStart),
      raceEnd: settlement, settledAt: settlement, options: { takerFeeRate } });
  } catch (error) { detail.conditionalRejection = error.message; }
  details.push(detail);
}
const settlementSeries = replayRaceSeries({ initialCapital: options.initialCapital, races: accepted }, options);
console.log(JSON.stringify({ classification: 'post-selected retrospective conditional sensitivity, not validated performance',
  assumptions: ['the 00:00–16:00 window was chosen after the two-hour results were inspected',
    'exact-midnight books that may be synthetic are excluded; each market starts at its first later book snapshot',
    'unverified capture coverage and receive-time ties use file order; possible exchange reordering remains',
    'source-stale snapshots can overwrite later source-time state and refresh local book age',
    'forecast settings, data vintage and lineup are retrospective; scores were rebuilt at midnight using earlier calendar dates',
    'one-second submission and cancellation latency; fills are known immediately when the public print is received',
    'trade-through fills, market impact, negative-risk conversion, actual rebates and transaction costs are excluded',
    'category taker fees are assumed, not independently authenticated per contract',
    'Gamma closedTime is assumed the immediate redemption time, without gas or operational delay',
    ...(relaxed ? ['240-second source-age threshold selected after observing source ages'] : [])],
  options, details, settlementSeries }, null, 2));
