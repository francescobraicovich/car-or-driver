// The qualifying observation stream and ratings must be invariant to actual
// race starting positions, including pit-lane and back-of-grid starts.
import { loadData } from '../packages/research/node/common.mjs';
import { collectExam } from '../packages/core/src/state-space/exam.js';
import { runSession } from '../packages/core/src/state-space/build.js';

const data = await loadData(new URL('../data', import.meta.url).pathname);
const original = collectExam(data.raw, data.lapSnapshots, data.maps, {}, data.lapPace);
const altered = collectExam(
  { ...data.raw, results: data.raw.results.map((row) => ({ ...row, grid: +row.grid > 0 ? '0' : '20' })) },
  data.lapSnapshots,
  data.maps,
  {},
  data.lapPace,
);
const first = original.weekends.map((weekend) => weekend.qualObs);
const second = altered.weekends.map((weekend) => weekend.qualObs);
if (JSON.stringify(first) !== JSON.stringify(second)) throw Error('Qualifying observations changed with the starting grid');
const qa = runSession(original.weekends, 'qual', original.model.params.tmBoost);
const qb = runSession(altered.weekends, 'qual', altered.model.params.tmBoost);
let difference = 0;
for (const [i, weekend] of qa.ratings.entries())
  for (const [id, rating] of weekend.drivers)
    difference = Math.max(difference, Math.abs(rating.m - qb.ratings[i].drivers.get(id).m));
if (difference !== 0) throw Error(`Qualifying ratings changed with the starting grid: ${difference}`);
console.log(JSON.stringify({ weekends: first.length, observations: first.reduce((sum, rows) => sum + rows.length, 0), maximumRatingDifference: difference }));
