// Post-observation wider-window feasibility only; not an independent test.
import { readFile } from 'node:fs/promises';
import { adaptWinnerCapture } from '../../portfolio/adapt-pmxt.mjs';
import { replayPortfolio } from '../../portfolio/replay.mjs';
import { filterBoundaryBooks } from '../full-window/filter_boundary_books.mjs';
import { adjustedProbabilities } from './search.mjs';

const required = ['--allow-unverified-feed', '--assume-retrospective-vintage', '--assume-closed-time-redemption'];
if (process.argv.length !== required.length + 2 || required.some((flag) => !process.argv.includes(flag))) {
  throw new Error(`Required flags: ${required.join(' ')}`);
}
const root = 'research/prediction-markets';
const directory = process.env.PMDATA_NORMALIZED_DIRECTORY;
if (!directory) throw new Error('PMDATA_NORMALIZED_DIRECTORY is required');
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const features = await read(`${root}/pmdata/strategy-features-midnight.json`);
const optimized = await read(`${root}/pmdata/optimization/results.json`);
if (!optimized.search?.selected || !Number.isFinite(optimized.selected?.bySplit?.['pseudo-holdout']?.initialCapital)) {
  throw new Error('A frozen training-selected strategy and starting capital are required');
}
const weights = optimized.search.selected.parameters;
const initialCapital = optimized.selected.bySplit['pseudo-holdout'].initialCapital;
const driverSpecs = [['norris', 'Lando Norris'], ['piastri', 'Oscar Piastri'],
  ['hamilton', 'Lewis Hamilton'], ['leclerc', 'Charles Leclerc']];
const specs = [['italian', 'Italian Grand Prix', 'Kimi Antonelli'], ['singapore', 'Singapore Grand Prix', 'Max Verstappen']];
const fixed = { initialCapital, orderSize: 5, minimumOrderSize: 5, maxInventory: 10, tickSize: 0.01,
  latencyMs: 1000, cancelLatencyMs: 1000, maxBookAgeMs: 60000, maxSourceAgeMs: 120000,
  minimumEdgeTicks: weights.minimumEdgeTicks, inventorySkewTicks: weights.inventorySkewTicks,
  allowUnverifiedData: true, allowSourceTimestampDisorder: true };
const outcomes = [];
for (const [race, name, winner] of specs) {
  const f = features.races.find((row) => row.race === name);
  if (!f) throw new Error(`Missing midnight features: ${race}`);
  const start = Date.parse(f.decisionTime);
  if (new Date(start).toISOString().slice(11) !== '00:00:00.000Z' || Date.parse(f.previousRaceDate) >= start) {
    throw new Error('Expected a midnight decision with an earlier-race feature prefix');
  }
  const official = await read(`${root}/pmdata/optimization/${race}-official-outcomes.json`);
  const capture = await read(`${directory}/${race}-capture.json`);
  const onchain = await read(`${directory}/${race}-fills.json`);
  const filtered = filterBoundaryBooks(capture.rows, start);
  capture.rows = filtered.rows;
  const forecast = { description: features.description, results: [{ ...f,
    roster: f.roster.map((driver) => ({ ...driver, probability: driver.baselineProbability })) }] };
  const winners = official.markets.filter((market) => Number(market.outcomePrices?.[0]) === 1);
  if (winners.length !== 1) throw new Error(`Ambiguous official winner: ${race}`);
  try {
    const adapted = adaptWinnerCapture({ capture, official, forecast, onchain, dataThrough: start,
      exitTime: start + 57600000, driverSpecs, allowRoundedVwap: true,
      resolution: { type: 'winner', driver: winner, winnerConditionId: winners[0].conditionId } });
    const probabilities = adjustedProbabilities(f.roster, weights);
    const input = { ...adapted.input, markets: adapted.input.markets.map((market) => ({ ...market,
      fairValue: { ...market.fairValue, probability: probabilities.get(market.driver) } })) };
    const settlement = replayPortfolio(input, fixed);
    const liquidation = replayPortfolio(input, { ...fixed, exitMode: 'liquidation', takerFeeRate: 0.05 });
    outcomes.push({ race, boundaryBooksExcluded: filtered.excluded,
      firstSnapshots: input.markets.map((market) => ({ driver: market.driver, at: new Date(market.coverage.start).toISOString() })),
      sourceHashes: capture.sources, roundedVwapAssumptions: adapted.provenance.roundedVwapAssumptions,
      settlement: { profit: settlement.profit, fills: settlement.fills, markets: settlement.markets,
        cashBeforeSettlement: settlement.cashBeforeSettlement, crossedBookIntervals: settlement.crossedBookIntervals,
        sourceTimestampReversals: settlement.sourceTimestampReversals },
      independentLiquidation: { complete: liquidation.complete, profit: liquidation.profit,
        fills: liquidation.fills, fees: liquidation.fees } });
  } catch (error) { outcomes.push({ race, boundaryBooksExcluded: filtered.excluded, rejection: error.message }); }
}
console.log(JSON.stringify({ classification: 'post-observation longer-window feasibility, not an independent test',
  note: 'Italy and Singapore were evaluated independently; the full pseudo-holdout cannot be assessed if either rejects.',
  initialCapital, weights, fixed, outcomes }, null, 2));
