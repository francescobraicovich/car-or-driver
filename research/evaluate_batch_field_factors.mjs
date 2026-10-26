import { fitSlope, observationRows } from '../packages/eval/src/index.js';
import { strictItems, strictScores } from '../packages/research/node/mover-strict.mjs';
import { load } from '../packages/research/node/strict-eval.mjs';
import { batchFieldFactorModel } from './batch_field_factor_model.mjs';

const options = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const { timeline, prep, idx, moves } = await load(2025, true);
const run = batchFieldFactorModel(timeline, prep.ctx.carOf, options);
const rows = observationRows(idx, run);
const slope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007));
const fieldSlope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007 && !row.same));
const windows = [['2002-11', 2002, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]];
const predictiveWindows = [['2008-11', 2008, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]];
const strict = strictScores(idx, run, fieldSlope, { moves, windows });
const items = strictItems(idx, run, moves, 5).filter((item) => item.kind === 'tm');
const raceLoss = predictiveWindows.map(([, from, to]) => {
  let total = 0;
  let weight = 0;
  for (const row of rows) {
    if (row.year < from || row.year > to) continue;
    const x = slope * row.z * (row.o ? -1 : 1);
    total += row.w * (Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x))));
    weight += row.w;
  }
  return total / weight;
});
const accuracy = windows.map(([, from, to]) => {
  const selected = items.filter((item) => item.year >= from && item.year <= to);
  const weight = selected.reduce((sum, item) => sum + item.w, 0);
  return selected.reduce((sum, item) => sum + item.w *
    (Math.abs(item.z) < 1e-10 ? 0.5 : Number((item.z > 0) === !!item.o)), 0) / weight;
});
console.log(JSON.stringify({ options, mover: windows.map(([name]) => strict[`${name}.k5`].tmLoss),
  field: windows.map(([name]) => strict[`${name}.k5`].fdLoss), raceLoss, accuracy,
  slope, fieldSlope }));
