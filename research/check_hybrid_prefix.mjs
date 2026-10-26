// No later weekend may change an earlier race rating or pre-race prediction.
import { load } from '../packages/research/node/strict-eval.mjs';
import { buildHybridRatings } from './hybrid_rating_model.mjs';

const old = await load(2025, true);
const full = await load(2026, true);
const a = buildHybridRatings(old.timeline, old.prep, old.base).hybrid;
const b = buildHybridRatings(full.timeline, full.prep, full.base).hybrid;
const sameMap = (x, y) => x.size === y.size && [...x].every(([key, value]) =>
  y.has(key) && Math.abs((typeof value === 'number' ? value : value.m) -
    (typeof y.get(key) === 'number' ? y.get(key) : y.get(key).m)) < 1e-9);
if (old.timeline.length >= full.timeline.length) throw Error('2026 suffix is empty');
for (let i = 0; i < old.timeline.length; i++) {
  if (old.timeline[i].raceId !== full.timeline[i].raceId) throw Error(`Timeline mismatch at ${i}`);
  for (const key of ['rated', 'drivers', 'cars'])
    if (!sameMap(a.pre[i][key], b.pre[i][key])) throw Error(`Pre-${key} changes at ${i}`);
  for (const key of ['drivers', 'cars'])
    if (!sameMap(a.post[i][key], b.post[i][key])) throw Error(`Post-${key} changes at ${i}`);
  for (const key of ['plain', 'adj']) {
    if (a.z[i][key].length !== b.z[i][key].length) throw Error(`Prediction size changes at ${i}`);
    for (let j = 0; j < a.z[i][key].length; j++)
      if (Math.abs(a.z[i][key][j] - b.z[i][key][j]) > 1e-9) throw Error(`Prediction changes at ${i}:${j}`);
  }
}
console.log(JSON.stringify({ checkedWeekends: old.timeline.length, laterWeekends: full.timeline.length - old.timeline.length, prefixInvariant: true }));
