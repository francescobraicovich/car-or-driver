// Test the graph displayed on the site as a 20% replacement for the published
// ranking component. All graph snapshots are used only after their weekend.
import { readFileSync, writeFileSync } from 'node:fs';
import { fitSlope, observationRows } from '../packages/eval/src/index.js';
import { strictItems, strictScores } from '../packages/research/node/mover-strict.mjs';
import { load } from '../packages/research/node/strict-eval.mjs';
import { buildTeammateGraph } from '../tools/teammate-graph.mjs';
import { buildHybridRatings } from './hybrid_rating_model.mjs';
import { jointRatingBlend } from './joint_rating_blend.mjs';

const { timeline, prep, base, idx, moves } = await load(2025, true);
const model = JSON.parse(readFileSync(new URL('../data/model.json', import.meta.url)));
const source = model.model.snaps.filter((snapshot) => snapshot.year <= 2025);
const { qualifying, baseline, hybrid } = buildHybridRatings(timeline, prep, base);
const first = jointRatingBlend(timeline, baseline, qualifying, 0.4, 0.25);
const qualifyingRows = observationRows(idx, qualifying);
const qualifyingSlope = fitSlope(qualifyingRows.filter((row) => row.year >= 2002 && row.year <= 2007));
const pairWindows = [['early', 2008, 2011], ['middle', 2012, 2015], ['recent', 2016, 2025]];
const moverWindows = [['early', 2002, 2011], ['middle', 2012, 2015], ['recent', 2016, 2025]];

function loss(rows, slope, start, end) {
  let sum = 0;
  let weight = 0;
  for (const row of rows) {
    if (row.year < start || row.year > end) continue;
    const x = slope * row.z * (row.o ? -1 : 1);
    sum += row.w * (Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x))));
    weight += row.w;
  }
  return { sum, weight };
}

function score(run) {
  const rows = observationRows(idx, run);
  const slope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007));
  const fieldSlope = fitSlope(rows.filter((row) => row.year >= 2002 && row.year <= 2007 && !row.same));
  const strict = strictScores(idx, run, fieldSlope, { moves, windows: moverWindows });
  const moverItems = strictItems(idx, run, moves, 5).filter((item) => item.kind === 'tm');
  return {
    allPairs: Object.fromEntries(pairWindows.map(([name, start, end]) => {
      const race = loss(rows, slope, start, end);
      const qualifying = loss(qualifyingRows, qualifyingSlope, start, end);
      return [name, (race.sum + qualifying.sum) / (race.weight + qualifying.weight)];
    })),
    movers: Object.fromEntries(moverWindows.map(([name, start, end]) => {
      const items = moverItems.filter((item) => item.year >= start && item.year <= end);
      const weight = items.reduce((sum, item) => sum + item.w, 0);
      return [name, {
        loss: strict[`${name}.k5`].tmLoss,
        accuracy: items.reduce((sum, item) => sum + item.w *
          (Math.abs(item.z) < 1e-10 ? 0.5 : Number((item.z > 0) === !!item.o)), 0) / weight,
        duels: items.length,
      }];
    })),
  };
}

const results = { published: score(hybrid) };
for (const halfLifeYears of [Infinity, 8, 3]) {
  const graph = buildTeammateGraph(source, prep.data.raw.results,
    prep.data.raw.qualifying, prep.data.raw.drivers, { halfLifeYears });
  const byRace = new Map(graph.map((snapshot) => [String(snapshot.raceId), snapshot]));
  const pre = [];
  const post = [];
  let level = new Map();
  for (const [index, weekend] of timeline.entries()) {
    const old = first.pre[index];
    const rated = new Map([...old.rated].map(([id]) => [id, level.get(id) ?? 0]));
    pre.push({ ...old, rated, drivers: rated });
    const snapshot = byRace.get(String(weekend.raceId));
    if (!snapshot) throw Error(`Missing graph snapshot for ${weekend.raceId}`);
    level = new Map(snapshot.nodes.map(([id, rating]) => [id, rating - 1000]));
    post.push({ ...first.post[index], drivers: new Map([...first.post[index].drivers].map(([id, value]) =>
      [id, { ...value, m: level.get(id) ?? 0 }])) });
  }
  const run = jointRatingBlend(timeline, first, { pre, post }, 0.2, 0);
  const name = Number.isFinite(halfLifeYears) ? `${halfLifeYears}-year-half-life` : 'no-decay';
  results[name] = score(run);
  console.log(JSON.stringify({ name, ...results[name] }));
}
const path = new URL('./alternative-rating-results/teammate-graph-decay.json', import.meta.url);
writeFileSync(path, `${JSON.stringify(results, null, 2)}\n`);
