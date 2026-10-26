import { fitSlope, observationRows } from '../packages/eval/src/index.js';
import { strictScores } from '../packages/research/node/mover-strict.mjs';
import { load } from '../packages/research/node/strict-eval.mjs';
import { buildHybridRatings } from './hybrid_rating_model.mjs';
import { jointRatingBlend } from './joint_rating_blend.mjs';
import { neuralFactorRating } from './neural_factor_rating.mjs';

const { timeline, prep, base, idx, moves } = await load(2025, true);
const { hybrid, qualifying } = buildHybridRatings(timeline, prep, base);
const neural = neuralFactorRating(timeline, 'race', prep.ctx.carOf,
  { dimension: 2, factorLearningRate: 5, seedScale: 0.5, factorPenalty: 0.05 });
const qualifyingRows = observationRows(idx, qualifying);
const qualifyingSlope = fitSlope(qualifyingRows.filter((row) => row.year >= 2002 && row.year <= 2007));
const moverWindows = [['2002-11', 2002, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]];
const predictiveWindows = [['2008-11', 2008, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]];
const weightedLoss = (rows, slope, from, to) => {
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
const evaluate = (share) => {
  const run = jointRatingBlend(timeline, hybrid, neural, share, share);
  const rows = observationRows(idx, run);
  const slope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007));
  const fieldSlope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007 && !row.same));
  const strict = strictScores(idx, run, fieldSlope, { moves, windows: moverWindows });
  return { share,
    allPair: predictiveWindows.map(([, from, to]) => {
      const race = weightedLoss(rows, slope, from, to);
      const qual = weightedLoss(qualifyingRows, qualifyingSlope, from, to);
      return (race.sum + qual.sum) / (race.weight + qual.weight);
    }),
    mover: moverWindows.map(([name]) => strict[`${name}.k5`].tmLoss),
    field: moverWindows.map(([name]) => strict[`${name}.k5`].fdLoss),
  };
};
console.log(JSON.stringify([0, 0.1, 0.2, 0.4, 0.6].map(evaluate), null, 2));
