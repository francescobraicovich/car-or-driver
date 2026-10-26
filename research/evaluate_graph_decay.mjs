// Compare historical evidence retention in the graph-like ranking component
// while leaving the published state-space components and blend fixed.
import { writeFileSync } from 'node:fs';
import { fitSlope, observationRows } from '../packages/eval/src/index.js';
import { strictItems, strictScores } from '../packages/research/node/mover-strict.mjs';
import { load } from '../packages/research/node/strict-eval.mjs';
import { buildHybridRatings, HYBRID_OPTIONS } from './hybrid_rating_model.mjs';

const { timeline, prep, base, idx, moves } = await load(2025, true);
const windows = [
  ['early', 2008, 2011],
  ['middle', 2012, 2015],
  ['recent', 2016, 2025],
];
const moverWindows = [
  ['early', 2002, 2011],
  ['middle', 2012, 2015],
  ['recent', 2016, 2025],
];
const retentions = [1, 0.95, 0.85, 0.7, 0.5];

function loss(rows, slope, start, end) {
  let sum = 0;
  let weight = 0;
  for (const row of rows) {
    if (row.year < start || row.year > end) continue;
    const x = slope * row.z * (row.o ? -1 : 1);
    sum += row.w * (Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x))));
    weight += row.w;
  }
  return { sum, weight, loss: sum / weight };
}

const qualifyingRows = observationRows(idx, buildHybridRatings(timeline, prep, base).qualifying);
const qualifyingSlope = fitSlope(qualifyingRows.filter((row) => row.year >= 2002 && row.year <= 2007));
const results = [];
for (const retention of retentions) {
  const options = {
    ...HYBRID_OPTIONS,
    ranking: { ...HYBRID_OPTIONS.ranking, driverWinterRetention: retention },
  };
  const { hybrid } = buildHybridRatings(timeline, prep, base, options);
  const rows = observationRows(idx, hybrid);
  const slope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007));
  const fieldSlope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007 && !row.same));
  const strict = strictScores(idx, hybrid, fieldSlope, { moves, windows: moverWindows });
  const moverItems = strictItems(idx, hybrid, moves, 5).filter((item) => item.kind === 'tm');
  const allPairs = Object.fromEntries(windows.map(([name, start, end]) => {
    const race = loss(rows, slope, start, end);
    const qualifying = loss(qualifyingRows, qualifyingSlope, start, end);
    return [name, (race.sum + qualifying.sum) / (race.weight + qualifying.weight)];
  }));
  const movers = Object.fromEntries(moverWindows.map(([name, start, end]) => {
    const items = moverItems.filter((item) => item.year >= start && item.year <= end);
    const weight = items.reduce((sum, item) => sum + item.w, 0);
    return [name, {
      loss: strict[`${name}.k5`].tmLoss,
      accuracy: items.reduce((sum, item) => sum + item.w *
        (Math.abs(item.z) < 1e-10 ? 0.5 : Number((item.z > 0) === !!item.o)), 0) / weight,
      duels: items.length,
    }];
  }));
  results.push({ retention, allPairs, movers });
  console.log(JSON.stringify(results.at(-1)));
}
const path = new URL('./alternative-rating-results/graph-decay.json', import.meta.url);
writeFileSync(path, `${JSON.stringify({ note: 'Historical scorecards; retention 0.95 is the published ranking setting.', results }, null, 2)}\n`);
