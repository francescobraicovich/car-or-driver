// This scenario is retrospective and conditional; its inputs are not a verified point-in-time feed.
import { readFile } from 'node:fs/promises';
import { adaptWinnerCapture } from './adapt-pmxt.mjs';
import { replayPortfolio } from './replay.mjs';
import { replayRaceSeries } from './race-series.mjs';
import { publishedSportsFeeScenario } from '../polymarket/historical-fees/sports-fee-scenarios.mjs';

const requiredFlags = ['--assume-retrospective-vintage', '--assume-closed-time-redemption', '--allow-unverified-feed'];
const argumentsProvided = process.argv.slice(2);
const twoHours = argumentsProvided.includes('--two-hour-window');
const expectedFlags = [...requiredFlags, ...(twoHours ? ['--two-hour-window'] : [])];
if (argumentsProvided.length !== expectedFlags.length || expectedFlags.some((flag) => !argumentsProvided.includes(flag))) {
  console.error(`Usage: node research/prediction-markets/portfolio/run-conditional.mjs ${requiredFlags.join(' ')} [--two-hour-window]`);
  process.exitCode = 1;
} else {
  const windowMs = (twoHours ? 2 : 1) * 3600000;
  const directory = 'research/prediction-markets';
  const read = async (path) => JSON.parse(await readFile(`${directory}/${path}`, 'utf8'));
  const onchain = await read('polymarket/onchain/winner/winner-onchain-events.json');
  const configurations = [
    { race: 'austrian', capture: 'austrian-2026-june-25', winner: 'George Russell',
      winnerId: '0xad67da53baaabe17272aa2a4cd67776585779422267579e91de9c50ec2c1fb72',
      raceStart: '2026-06-28T13:00:00Z', raceEndBound: '2026-06-28T15:03:00Z',
      raceEndEvidence: 'https://www.formula1.com/en/latest/article/russell-seals-victory-in-thrilling-austrian-grand-prix-ahead-of-verstappen-and-antonelli.5kjw8LmvWRcsaFgjCr8aWw' },
    { race: 'british', capture: 'british-2026-july-02', winner: 'Charles Leclerc',
      winnerId: '0xd8b3a566d0f4f200561cf812f90c78dd745cc418e980bc97e5c5f1294ec9c61e',
      raceStart: '2026-07-05T14:00:00Z', raceEndBound: '2026-07-05T15:53:00Z',
      raceEndEvidence: 'https://www.formula1.com/en/latest/article/leclerc-wins-dramatic-british-grand-prix.3bGl6laB38GIr1PfxJTNmY' },
  ];
  const options = { initialCapital: 100, orderSize: 5, minimumOrderSize: 5, maxInventory: 10, tickSize: 0.01,
    latencyMs: 1000, maxBookAgeMs: 60000, maxSourceAgeMs: 60000, minimumEdgeTicks: 1, inventorySkewTicks: 0.1,
    allowUnverifiedData: true, allowSourceTimestampDisorder: true };
  const races = [], inputs = [];
  for (const config of configurations) {
    const forecast = await read(`forecast/${config.race}-2026-baseline.json`);
    const official = await read(`polymarket/${config.race}-2026-official-outcomes.json`);
    const capture = await read(`polymarket/${config.capture}-winner-events.json`);
    const start = Date.parse(forecast.results[0].decisionTime);
    const adapted = adaptWinnerCapture({ capture, official, forecast, onchain, dataThrough: start, exitTime: start + windowMs,
      resolution: { type: 'winner', driver: config.winner, winnerConditionId: config.winnerId } });
    const closedAt = Math.max(...official.markets.map((market) => Date.parse(market.closedTime)));
    if (!Number.isFinite(closedAt)) throw new Error('Missing Gamma closure time');
    const fee = publishedSportsFeeScenario(start);
    const entry = { input: adapted.input, tradingStart: start, raceStart: Date.parse(config.raceStart),
      raceEnd: Date.parse(config.raceEndBound), settledAt: closedAt, options: { takerFeeRate: fee.takerFeeRate } };
    races.push(entry);
    let strictRejection = null;
    try { replayPortfolio(adapted.input, { ...options, allowUnverifiedData: false, allowSourceTimestampDisorder: false }); }
    catch (error) { strictRejection = error.message; }
    if (!strictRejection) throw new Error('Strict replay unexpectedly accepted an unverified capture');
    const liquidation = replayPortfolio(adapted.input, { ...options, takerFeeRate: fee.takerFeeRate, exitMode: 'liquidation' });
    inputs.push({ race: config.race, strictRejection, tradingWindowStart: start, tradingWindowEnd: start + windowMs,
      firstSnapshotTimes: adapted.input.markets.map((market) => ({ driver: market.driver, timestamp: market.coverage.start })),
      normalizedEvents: adapted.input.events.length, normalizedTradeLegs: adapted.input.events.filter((event) => event.type === 'trade').length,
      observedTransactionCount: new Set(adapted.input.events.filter((event) => event.type === 'trade').map((event) => event.transactionHash)).size,
      categoryFeeScenario: fee.takerFeeRate, officialClosedTimeAssumedRedeemable: closedAt,
      raceEndBoundEvidence: config.raceEndEvidence, provenance: adapted.provenance,
      liquidationSensitivity: { independentStartingCapital: options.initialCapital, ...liquidation } });
  }
  const series = replayRaceSeries({ initialCapital: options.initialCapital, races }, options);
  console.log(JSON.stringify({
    classification: 'conditional retrospective sensitivity, not a validated historical backtest',
    assumptions: ['model inputs and fitted parameters are retrospective and their historical publication vintage is unverified',
      'Gamma closedTime is used as an assumed redemption time; actual redeemability at that time is unverified',
      'source receipt order is used despite exchange timestamp reversals and incomplete capture',
      'initial snapshot timestamp ties are excluded and may contain trades',
      'maker fees and rebates are zero; liquidation uses a category-level taker fee scenario not verified for each order',
      `${twoHours ? 'two-hour' : 'one-hour'} window, tick size, minimum size, queue, cancel latency, inventory and capital are researcher assumptions`,
      ...(twoHours ? ['the two-hour window was selected after examining activity, so it is not an untouched test'] : []),
      'a print only fills an order at the exact price; trade-through adverse fills can be omitted',
      'no conversion between negative-risk markets, dynamic tick changes or liquidity rewards'],
    parameters: options, races: inputs, settlementSeries: series,
  }, null, 2));
}
