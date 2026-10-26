import { fitSlope, observationRows, stateSpaceRun } from '../packages/eval/src/index.js';
import { qualLink } from '../packages/core/src/state-space/qualifying-link.js';
import { strictItems, strictScores } from '../packages/research/node/mover-strict.mjs';
import { FINAL, load } from '../packages/research/node/strict-eval.mjs';
import { componentExposure, discriminativeRanking } from './alternative_rating_models.mjs';
import { jointRatingBlend } from './joint_rating_blend.mjs';

const { timeline, prep, base, idx, moves } = await load(2025, true);
const q = stateSpaceRun(timeline, 'qual', prep.ctx, base.qual);
const r = stateSpaceRun(timeline, 'race', { ...prep.ctx, ...qualLink(q.raw, FINAL.beta, FINAL.gamma) }, { ...base.race, ...FINAL.race });
const exposure = componentExposure(timeline, prep.data.raw.races);
const strong = process.argv[2] === 'strong';
const rank = discriminativeRanking(timeline, 'race', prep.ctx.carOf, exposure,
  { learningRate: strong ? 180 : 120, teammateWeight: strong ? 4 : 1,
    levelPenalty: 0.001, carWinterRetention: 0.8, includeComponent: false });
const windows = [['w2', 2008, 2011], ['w3', 2012, 2015], ['recent', 2016, 2025]];
const qRows = observationRows(idx, q);
const qSlope = fitSlope(qRows.filter((row) => row.year >= 2002 && row.year <= 2007));
const loss = (rows, slope, from, to) => {
  let sum = 0;
  let weight = 0;
  for (const row of rows) {
    if (row.year < from || row.year > to) continue;
    const x = (row.o ? -1 : 1) * slope * row.z;
    sum += row.w * (Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x))));
    weight += row.w;
  }
  return { sum, weight };
};
const qLoss = windows.map(([, from, to]) => loss(qRows, qSlope, from, to));
for (const qualDriverShare of strong ? [0.4] : [0.2, 0.4, 0.6]) {
  for (const rankDriverShare of strong ? [0.2, 0.3, 0.4, 0.5, 0.6] : [0.2, 0.4, 0.6, 0.8]) {
    for (const qualCarShare of strong ? [0.25] : [0.15, 0.25, 0.35]) {
      const first = jointRatingBlend(timeline, r, q, qualDriverShare, qualCarShare);
      const run = jointRatingBlend(timeline, first, rank, rankDriverShare, 0);
      const rows = observationRows(idx, run);
      const slope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007));
      const combined = Object.fromEntries(windows.map(([name, from, to], i) => {
        const cell = loss(rows, slope, from, to);
        return [name, (cell.sum + qLoss[i].sum) / (cell.weight + qLoss[i].weight)];
      }));
      const c = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007 && !row.same));
      const strict = strictScores(idx, run, c, { moves,
        windows: [['early', 2002, 2011], ['middle', 2012, 2015], ['recent', 2016, 2025]] });
      const accuracy = {};
      const items = strictItems(idx, run, moves, 5).filter((item) => item.kind === 'tm');
      for (const [name, from, to] of [['early', 2002, 2011], ['middle', 2012, 2015], ['recent', 2016, 2025]]) {
        const selected = items.filter((item) => item.year >= from && item.year <= to);
        const weight = selected.reduce((sum, item) => sum + item.w, 0);
        accuracy[name] = selected.reduce((sum, item) => sum + item.w * (Math.abs(item.z) < 1e-10 ? 0.5 : Number((item.z > 0) === !!item.o)), 0) / weight;
      }
      console.log(JSON.stringify({ qualDriverShare, rankDriverShare, qualCarShare,
        ...combined, movers: Object.fromEntries(['early', 'middle', 'recent'].map((name) => [name, strict[`${name}.k5`].tmLoss])), accuracy }));
    }
  }
}
