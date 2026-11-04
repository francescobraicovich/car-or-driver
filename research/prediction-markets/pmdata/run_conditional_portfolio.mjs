// Retrospective sensitivity, not an authenticated backtest or trading advice.
import { readFile } from 'node:fs/promises';
import { adaptWinnerCapture } from '../portfolio/adapt-pmxt.mjs';
import { replayPortfolio } from '../portfolio/replay.mjs';
import { replayRaceSeries } from '../portfolio/race-series.mjs';

const flags = process.argv.slice(2);
const required = ['--allow-unverified-feed', '--assume-retrospective-vintage', '--assume-closed-time-redemption'];
const extended = flags.includes('--allow-120-second-source-age');
const allowed = [...required, ...(extended ? ['--allow-120-second-source-age'] : [])];
if (flags.length !== allowed.length || allowed.some((flag) => !flags.includes(flag))) {
  throw new Error(`Required flags: ${required.join(' ')} [--allow-120-second-source-age]`);
}
const read = async (file) => JSON.parse(await readFile(file, 'utf8'));
const configurations = [
  { race: 'austrian', winner: 'George Russell', raceStart: '2026-06-28T13:00:00Z' },
  { race: 'british', winner: 'Charles Leclerc', raceStart: '2026-07-05T14:00:00Z' },
  { race: 'belgian', winner: 'Kimi Antonelli', raceStart: '2026-07-19T13:00:00Z' },
  { race: 'hungarian', winner: 'Lando Norris', raceStart: '2026-07-26T13:00:00Z' },
  { race: 'dutch', winner: 'Lando Norris', raceStart: '2026-08-23T13:00:00Z' },
  { race: 'italian', winner: 'Kimi Antonelli', raceStart: '2026-09-06T13:00:00Z' },
  { race: 'singapore', winner: 'Max Verstappen', raceStart: '2026-10-11T12:00:00Z' },
];
const options = { initialCapital: 100, orderSize: 5, minimumOrderSize: 5, maxInventory: 10,
  tickSize: 0.01, latencyMs: 1000, cancelLatencyMs: 1000, maxBookAgeMs: 60000, maxSourceAgeMs: extended ? 120000 : 60000,
  minimumEdgeTicks: 1, inventorySkewTicks: 0.1, allowUnverifiedData: true,
  allowSourceTimestampDisorder: true };
const races = [], details = [];
const normalizedDirectory = process.env.PMDATA_NORMALIZED_DIRECTORY ?? 'tmp/pmdata';
for (const { race, winner, raceStart } of configurations) {
  const prefix = 'research/prediction-markets';
  const capture = await read(`${normalizedDirectory}/${race}-capture.json`);
  const onchain = await read(`${normalizedDirectory}/${race}-fills.json`);
  const official = await read(`${prefix}/polymarket/${race}-2026-official-outcomes.json`);
  const forecast = await read(`${prefix}/forecast/${race}-2026-baseline.json`);
  const start = Date.parse(forecast.results[0].decisionTime);
  const matches = official.markets.filter((market) => Number(market.outcomePrices?.[0]) === 1);
  if (matches.length !== 1) throw new Error(`${race} lacks a unique official winner`);
  const settlement = Math.max(...official.markets.map((market) => Date.parse(market.closedTime)));
  const adapted = adaptWinnerCapture({ capture, official, forecast, onchain, dataThrough: start,
    exitTime: start + 7200000, resolution: { type: 'winner', driver: winner, winnerConditionId: matches[0].conditionId } });
  const input = adapted.input;
  const detail = { race, outcome: winner, windowStart: new Date(start).toISOString(),
    windowEnd: new Date(input.exitTime).toISOString(),
    firstSnapshots: input.markets.map((market) => ({ driver: market.driver, timestamp: new Date(market.coverage.start).toISOString(),
      timestampUs: Math.round(market.coverage.start * 1000) })),
    unsequencedSameTimeRows: capture.unsequencedSameTimeRows,
    normalizedEvents: input.events.length, normalizedTradeLegs: input.events.filter((event) => event.type === 'trade').length,
    dataProvenance: capture.sources, strictRejection: null, conditionalRejection: null };
  try { replayPortfolio(input, { ...options, allowUnverifiedData: false, allowSourceTimestampDisorder: false }); }
  catch (error) { detail.strictRejection = error.message; }
  if (!detail.strictRejection) throw new Error(`${race} unexpectedly accepted without data coverage`);
  const fee = start < Date.parse('2026-07-10T00:00:00Z') ? 0.03 : 0.05;
  detail.assumedSportsTakerCoefficient = fee;
  try {
    const independent = replayPortfolio(input, { ...options, takerFeeRate: fee });
    const liquidation = replayPortfolio(input, { ...options, takerFeeRate: fee, exitMode: 'liquidation' });
    detail.independentSettlementSensitivity = independent;
    detail.independentLiquidationSensitivity = liquidation;
    // Gamma closure is an assumed redemption time. Using it also as an upper
    // bound for race end avoids inventing an exact finish timestamp.
    races.push({ input, tradingStart: start, raceStart: Date.parse(raceStart), raceEnd: settlement,
      settledAt: settlement, options: { takerFeeRate: fee } });
  } catch (error) { detail.conditionalRejection = error.message; }
  details.push(detail);
}
const series = replayRaceSeries({ initialCapital: options.initialCapital, races }, options);
console.log(JSON.stringify({ classification: 'conditional retrospective sensitivity; not verified historical account performance',
  assumptions: ['one or more source snapshots start later than the requested window; earlier book state is excluded',
    'historical coverage and exchange sequence cannot be established; receive-time ties retain file order',
    'signal inputs, fitted settings and roster are retrospective; no historical model vintage was verified',
    'closedTime and immediate redemption are assumed; actual redemption costs and latency are excluded',
    'maker fees and rebates are zero; taker fees use unverified category coefficients 0.03 or 0.05',
    'YES/NO complete sets are separately funded; negative-risk conversion is not modeled',
    'one-second order submission and cancellation latency; simulated fills are known immediately at print receipt',
    'no trade-through fills or market impact; actual order-fill acknowledgement latency is not modeled',
    ...(extended ? ['120-second source-age threshold selected after observing Italy/Singapore delays'] : [])],
  options, details, settlementSeries: series }, null, 2));
