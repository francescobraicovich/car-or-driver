import { fitSlope, observationRows } from '../packages/eval/src/index.js';
import { strictItems, strictScores } from '../packages/research/node/mover-strict.mjs';
import { load } from '../packages/research/node/strict-eval.mjs';
import { neuralFactorRating } from './neural_factor_rating.mjs';

const options = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const { timeline, prep, idx, moves } = await load(2025, true);
const race = neuralFactorRating(timeline, 'race', prep.ctx.carOf, options);
const qual = neuralFactorRating(timeline, 'qual', prep.ctx.carOf, options);
const raceRows = observationRows(idx, race);
const qualRows = observationRows(idx, qual);
const raceSlope = fitSlope(raceRows.filter((row) => row.year >= 2002 && row.year <= 2007));
const qualSlope = fitSlope(qualRows.filter((row) => row.year >= 2002 && row.year <= 2007));
const fieldSlope = fitSlope(raceRows.filter((row) => row.year >= 2002 && row.year <= 2007 && !row.same));
const moverWindows = [['2002-11', 2002, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]];
const predictiveWindows = [['2008-11', 2008, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]];
const strict = strictScores(idx, race, fieldSlope, { moves, windows: moverWindows });
const items = strictItems(idx, race, moves, 5).filter((row) => row.kind === 'tm');
const loss = (rows, slope, from, to) => {
  let total = 0;
  let weight = 0;
  for (const row of rows) {
    if (row.year < from || row.year > to) continue;
    const x = slope * row.z * (row.o ? -1 : 1);
    total += row.w * (Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x))));
    weight += row.w;
  }
  return { total, weight };
};
console.log(JSON.stringify({ options,
  allPair: predictiveWindows.map(([, from, to]) => {
    const r = loss(raceRows, raceSlope, from, to);
    const q = loss(qualRows, qualSlope, from, to);
    return (r.total + q.total) / (r.weight + q.weight);
  }),
  mover: moverWindows.map(([name]) => strict[`${name}.k5`].tmLoss),
  field: moverWindows.map(([name]) => strict[`${name}.k5`].fdLoss),
  accuracy: moverWindows.map(([, from, to]) => {
    const selected = items.filter((item) => item.year >= from && item.year <= to);
    const weight = selected.reduce((sum, item) => sum + item.w, 0);
    return selected.reduce((sum, item) => sum + item.w *
      (Math.abs(item.z) < 1e-10 ? 0.5 : Number((item.z > 0) === !!item.o)), 0) / weight;
  }),
  calibration: { race: raceSlope, qualifying: qualSlope, field: fieldSlope },
}));
