import { fitSlope, observationRows } from '../packages/eval/src/index.js';
import { strictItems, strictScores } from '../packages/research/node/mover-strict.mjs';
import { load } from '../packages/research/node/strict-eval.mjs';
import { jointDuelFactorModel } from './joint_duel_factor_model.mjs';

const env = await load(2025, true);
const { timeline, prep, idx, moves } = env;
const windows = [['2002-11', 2002, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]];
const predictiveWindows = [['2008-11', 2008, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]];
const loss = (rows, slope, from, to) => {
  let sum = 0;
  let weight = 0;
  for (const row of rows) {
    if (row.year < from || row.year > to) continue;
    const x = slope * row.z * (row.o ? -1 : 1);
    sum += row.w * (Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x))));
    weight += row.w;
  }
  return { sum, weight };
};
const score = (options) => {
  const runs = jointDuelFactorModel(timeline, prep.ctx.carOf, options);
  const raceRows = observationRows(idx, runs.race);
  const qualRows = observationRows(idx, runs.qual);
  const raceSlope = fitSlope(raceRows.filter((row) => row.year >= 2002 && row.year <= 2007));
  const qualSlope = fitSlope(qualRows.filter((row) => row.year >= 2002 && row.year <= 2007));
  const fieldSlope = fitSlope(raceRows.filter((row) => row.year >= 2002 && row.year <= 2007 && !row.same));
  const strict = strictScores(idx, runs.race, fieldSlope, { moves, windows });
  const items = strictItems(idx, runs.race, moves, 5).filter((item) => item.kind === 'tm');
  return {
    options,
    allPair: predictiveWindows.map(([, from, to]) => {
      const race = loss(raceRows, raceSlope, from, to);
      const qual = loss(qualRows, qualSlope, from, to);
      return (race.sum + qual.sum) / (race.weight + qual.weight);
    }),
    mover: windows.map(([name]) => strict[`${name}.k5`].tmLoss),
    field: windows.map(([name]) => strict[`${name}.k5`].fdLoss),
    accuracy: windows.map(([, from, to]) => {
      const selected = items.filter((item) => item.year >= from && item.year <= to);
      const weight = selected.reduce((sum, item) => sum + item.w, 0);
      return selected.reduce((sum, item) => sum + item.w *
        (Math.abs(item.z) < 1e-10 ? 0.5 : Number((item.z > 0) === !!item.o)), 0) / weight;
    }),
    slopes: { race: raceSlope, qual: qualSlope },
  };
};

const specified = process.argv[2] ? JSON.parse(process.argv[2]) : null;
if (specified) {
  console.log(JSON.stringify(score(specified)));
} else {
  const results = [];
  for (const teammateWeight of [1, 3, 8])
    for (const driverStep of [20, 50, 100])
      for (const carStep of [50, 100])
        for (const qualifyingWeight of [0.5, 2]) {
          const result = score({ teammateWeight, driverStep, carStep, qualifyingWeight });
          results.push(result);
        }
  results.sort((a, b) =>
    a.mover.reduce((sum, value) => sum + value, 0) - b.mover.reduce((sum, value) => sum + value, 0));
  console.log(JSON.stringify({ bestMover: results.slice(0, 10), bestAllPair: results.slice().sort((a, b) =>
    a.allPair.reduce((sum, value) => sum + value, 0) - b.allPair.reduce((sum, value) => sum + value, 0)).slice(0, 10) }, null, 2));
}
