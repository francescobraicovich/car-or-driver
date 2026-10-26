import { fitSlope, observationRows } from '../packages/eval/src/index.js';
import { strictItems, strictScores } from '../packages/research/node/mover-strict.mjs';
import { load } from '../packages/research/node/strict-eval.mjs';
import { componentExposure, discriminativeRanking } from './alternative_rating_models.mjs';
import { buildHybridRatings } from './hybrid_rating_model.mjs';
import { jointRatingBlend } from './joint_rating_blend.mjs';

const { timeline, prep, base, idx, moves } = await load(2025, true);
const { hybrid, qualifying } = buildHybridRatings(timeline, prep, base);
const exposure = componentExposure(timeline, prep.data.raw.races);
const qualifyingRanking = discriminativeRanking(timeline, 'qual', prep.ctx.carOf, exposure,
  { includeComponent: false, learningRate: 180, teammateWeight: 2,
    levelPenalty: 0.001, carWinterRetention: 0.8 });
const windows = [['2002-11', 2002, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]];
const predictiveWindows = [['2008-11', 2008, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]];
const qualifyingRows = observationRows(idx, qualifying);
const qualifyingSlope = fitSlope(qualifyingRows.filter((row) => row.year >= 2002 && row.year <= 2007));
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
const evaluate = (share) => {
  const run = jointRatingBlend(timeline, hybrid, qualifyingRanking, share, 0);
  const rows = observationRows(idx, run);
  const slope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007));
  const fieldSlope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007 && !row.same));
  const strict = strictScores(idx, run, fieldSlope, { moves, windows });
  const items = strictItems(idx, run, moves, 5).filter((row) => row.kind === 'tm');
  return { share, slope,
    fitRace: (() => { const result = loss(rows, slope, 2002, 2007); return result.total / result.weight; })(),
    allPair: predictiveWindows.map(([, from, to]) => {
      const race = loss(rows, slope, from, to);
      const qual = loss(qualifyingRows, qualifyingSlope, from, to);
      return (race.total + qual.total) / (race.weight + qual.weight);
    }),
    mover: windows.map(([name]) => strict[`${name}.k5`].tmLoss),
    field: windows.map(([name]) => strict[`${name}.k5`].fdLoss),
    accuracy: windows.map(([, from, to]) => {
      const selected = items.filter((item) => item.year >= from && item.year <= to);
      const weight = selected.reduce((sum, item) => sum + item.w, 0);
      return selected.reduce((sum, item) => sum + item.w *
        (Math.abs(item.z) < 1e-10 ? 0.5 : Number((item.z > 0) === !!item.o)), 0) / weight;
    }),
  };
};
console.log(JSON.stringify([0, 0.2, 0.4, 0.6, 0.8, 1].map(evaluate), null, 2));
