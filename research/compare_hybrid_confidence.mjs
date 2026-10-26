// Paired, cluster-aware comparison of the fixed 20% hybrid against existing ratings.
import { writeFileSync } from 'node:fs';
import { clusterBootstrap, fitSlope, logisticCalibration, nll, observationRows } from '../packages/eval/src/index.js';
import { strictItems, strictStayers } from '../packages/research/node/mover-strict.mjs';
import { load } from '../packages/research/node/strict-eval.mjs';
import { discriminativeRanking } from './alternative_rating_models.mjs';
import { buildHybridRatings } from './hybrid_rating_model.mjs';

const { timeline, prep, base, idx, moves } = await load(2025, true);
const { baseline, hybrid, exposure } = buildHybridRatings(timeline, prep, base);
const originalRanking = discriminativeRanking(timeline, 'race', prep.ctx.carOf, exposure, { includeComponent: false });
const windows = [['2008-11', 2008, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025], ['pooled', 2008, 2025]];
const moverWindows = [['2002-11', 2002, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025], ['pooled', 2002, 2025]];
const comparison = (items, clusterKey) => {
  const grouped = new Map();
  for (const item of items) {
    if (!grouped.has(item[clusterKey])) grouped.set(item[clusterKey], { key: item[clusterKey], sum: 0, weight: 0 });
    const group = grouped.get(item[clusterKey]);
    group.sum += item.delta;
    group.weight += item.w;
  }
  return clusterBootstrap([...grouped.values()], (group) => group.key,
    (groups) => groups.reduce((sum, group) => sum + group.sum, 0) /
      groups.reduce((sum, group) => sum + group.weight, 0), { B: 1000, seed: 17 });
};
const oldRows = observationRows(idx, baseline);
const newRows = observationRows(idx, hybrid);
if (oldRows.length !== newRows.length) throw Error('Pair row counts differ');
const oldSlope = fitSlope(oldRows.filter((row) => row.year >= 2002 && row.year <= 2007));
const newSlope = fitSlope(newRows.filter((row) => row.year >= 2002 && row.year <= 2007));
const allPairItems = oldRows.map((old, i) => {
  const fresh = newRows[i];
  if (old.i !== fresh.i || old.o !== fresh.o || old.x !== fresh.x || old.y !== fresh.y) throw Error('Pair rows misaligned');
  return { year: old.year, w: old.w,
    delta: old.w * (nll(oldSlope * old.z, old.o) - nll(newSlope * fresh.z, fresh.o)) };
});
const stayerSlope = (run) => {
  const items = strictStayers(idx, run, 5);
  return logisticCalibration(items.map((row) => row.z), items.map((row) => row.o), items.map((row) => row.w), { intercept: false }).b;
};
const moverComparison = (oldRun) => {
  const old = strictItems(idx, oldRun, moves, 5).filter((row) => row.kind === 'tm');
  const fresh = strictItems(idx, hybrid, moves, 5).filter((row) => row.kind === 'tm');
  if (old.length !== fresh.length) throw Error('Mover duel counts differ');
  const a = stayerSlope(oldRun);
  const b = stayerSlope(hybrid);
  const items = old.map((row, i) => {
    const next = fresh[i];
    if (row.driverId !== next.driverId || row.t0 !== next.t0 || row.o !== next.o || row.w !== next.w)
      throw Error('Mover rows misaligned');
    return { year: row.year, move: `${row.driverId}:${row.t0}`, w: row.w,
      delta: row.w * (nll(a * row.z, row.o) - nll(b * next.z, next.o)) };
  });
  return Object.fromEntries(moverWindows.map(([name, from, to]) => [name,
    comparison(items.filter((row) => row.year >= from && row.year <= to), 'move')]));
};
const result = {
  note: 'Positive loss reduction favors the hybrid. All-pair intervals resample seasons; frozen mover intervals resample moves.',
  allPairVersusBaseline: Object.fromEntries(windows.map(([name, from, to]) => [name,
    comparison(allPairItems.filter((row) => row.year >= from && row.year <= to), 'year')])),
  moverVersusBaseline: moverComparison(baseline),
  moverVersusOriginalRanking: moverComparison(originalRanking),
};
const target = new URL('./alternative-rating-results/hybrid-confidence.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
