import { fitSlope, observationRows, stateSpaceRun } from '../packages/eval/src/index.js';
import { qualLink } from '../packages/core/src/state-space/qualifying-link.js';
import { strictItems, strictScores } from '../packages/research/node/mover-strict.mjs';
import { FINAL, load } from '../packages/research/node/strict-eval.mjs';
import { jointRatingBlend } from './joint_rating_blend.mjs';
import { teammatePaceGraph } from './teammate_pace_graph.mjs';

const options = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const { timeline, prep, base, idx, moves } = await load(2025, true);
const q = stateSpaceRun(timeline, 'qual', prep.ctx, base.qual);
const r = stateSpaceRun(timeline, 'race', { ...prep.ctx, ...qualLink(q.raw, FINAL.beta, FINAL.gamma) }, { ...base.race, ...FINAL.race });
const car = jointRatingBlend(timeline, r, q, 0, 0.25);
const run = teammatePaceGraph(timeline, prep.data, car, prep.ctx.carOf, options);
const windows = [['early', 2002, 2011], ['middle', 2012, 2015], ['recent', 2016, 2025]];
const rows = observationRows(idx, run);
const qRows = observationRows(idx, q);
const slope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007));
const qSlope = fitSlope(qRows.filter((row) => row.year >= 2002 && row.year <= 2007));
const c = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007 && !row.same));
const strict = strictScores(idx, run, c, { moves, windows });
const allPair = Object.fromEntries([['w2', 2008, 2011], ['w3', 2012, 2015], ['recent', 2016, 2025]].map(([name, from, to]) => {
  let sum = 0;
  let weight = 0;
  for (const [rr, factor] of [[rows, slope], [qRows, qSlope]]) for (const row of rr) {
    if (row.year < from || row.year > to) continue;
    const x = factor * row.z * (row.o ? -1 : 1);
    sum += row.w * (Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x))));
    weight += row.w;
  }
  return [name, sum / weight];
}));
const items = strictItems(idx, run, moves, 5).filter((item) => item.kind === 'tm');
const accuracy = Object.fromEntries(windows.map(([name, from, to]) => {
  const selected = items.filter((item) => item.year >= from && item.year <= to);
  const weight = selected.reduce((sum, item) => sum + item.w, 0);
  return [name, selected.reduce((sum, item) => sum + item.w *
    (Math.abs(item.z) < 1e-10 ? 0.5 : Number((item.z > 0) === !!item.o)), 0) / weight];
}));
console.log(JSON.stringify({ options, allPair,
  movers: Object.fromEntries(windows.map(([name]) => [name, strict[`${name}.k5`].tmLoss])), accuracy }));
