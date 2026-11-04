import assert from 'node:assert/strict';
import { persistentSession } from '../research/stable-ratings/persistent-candidates.mjs';

const k = Math.LN10 / 75;
const map = (a, b) =>
  new Map([
    ['a', a],
    ['b', b],
  ]);
const wrap = (values) => new Map([...values].map(([id, m]) => [id, { m, sd: 1, seen: true }]));
function fixture(targets) {
  const timeline = targets.map(() => ({ obs: { race: [{ x: 'a', y: 'b', cx: 'x', cy: 'x' }], qual: [] } }));
  const pre = targets.map(() => ({ rated: map(0, 0), drivers: map(0, 0), cars: new Map([['x', 0]]) }));
  const post = targets.map((target) => ({ drivers: wrap(map(target, -target)), cars: wrap(new Map([['x', 0]])) }));
  const z = targets.map(() => ({ plain: Float64Array.of(0), vari: Float64Array.of(1) }));
  const predictions = targets.map(() => ({ mean: Float64Array.of(0), vari: Float64Array.of(1) }));
  const latest = { driverIds: ['a', 'b'], carIds: ['x'], mean: Float64Array.of(targets.at(-1), -targets.at(-1), 0) };
  return { timeline, base: { session: 'race', k, pre, post, z, raw: { pre, ratings: post, predictions, latest } } };
}
function run(targets, scale) {
  const { timeline, base } = fixture(targets);
  return persistentSession(timeline, base, null, 0.75, 0, scale);
}
const score = (run, index) => run.post[index].drivers.get('a').m;
for (const scale of [4, 8]) {
  const positive = score(run([2], scale), 0);
  const negative = score(run([-2], scale), 0);
  assert(Math.abs(positive + negative) < 1e-12, 'swapping driver labels reverses the update');
  assert(positive > 0 && positive < score(run([4], scale), 0), 'update increases monotonically with innovation');
  assert(score(run([1e6], scale), 0) <= 0.75 * scale, 'single-step influence is bounded');
  assert(Math.abs(positive - 0.75 * scale * Math.tanh(2 / scale)) < 1e-12);
  const expected = run([2, 4], scale);
  const upset = run([2, -4], scale);
  assert(
    score(expected, 1) - score(expected, 0) < score(upset, 0) - score(upset, 1),
    'an upset after one win moves the state more than an expected win',
  );
  assert.deepEqual(expected.pre[0], run([2], scale).pre[0]);
  assert.deepEqual(expected.post[0], run([2], scale).post[0], 'future outcomes cannot alter an earlier state');
}
const previous = fixture([2, 4]);
assert.deepEqual(
  persistentSession(previous.timeline, previous.base, null, 0.25, 0),
  persistentSession(previous.timeline, previous.base, null, 0.25, 0, Infinity),
  'the earlier linear family is unchanged by the optional scale',
);
for (const scale of [4, 8]) {
  const sustained = run([75, 75, 75], scale);
  assert(
    score(sustained, 0) < score(sustained, 1) && score(sustained, 1) < score(sustained, 2),
    'large sustained innovations continue moving the state at practical rating scales',
  );
  const { timeline, base } = fixture([0, 0, 0]);
  const field = (ids) => new Map(ids.map((id) => [id, 0]));
  const four = ['a', 'b', 'c', 'd'];
  const three = ['a', 'b', 'c'];
  for (const [i, ids] of [four, three, four].entries()) {
    base.pre[i] = { rated: field(ids), drivers: field(ids), cars: new Map([['x', 0]]) };
    base.post[i] = { drivers: wrap(field(ids)), cars: wrap(new Map([['x', 0]])) };
  }
  base.post[1].drivers = wrap(
    new Map([
      ['a', 30],
      ['b', -20],
      ['c', -10],
    ]),
  );
  for (const i of [0, 2]) {
    timeline[i].obs.race = [];
    base.z[i] = { plain: new Float64Array(), vari: new Float64Array() };
    base.raw.predictions[i] = { mean: new Float64Array(), vari: new Float64Array() };
  }
  const result = persistentSession(timeline, base, null, 0.75, 0, scale);
  assert(
    Math.abs(result.pre[2].rated.get('d')) < 1e-12,
    'an absent driver returns to the same stored field reference after unequal updates',
  );
  assert.deepEqual(result.post[2].drivers, wrap(new Map([...result.pre[2].rated])), 'a result-free move causes no stored-level update');
  assert(Math.abs([...result.post[1].drivers.values()].reduce((sum, value) => sum + value.m, 0)) < 1e-12);
}
console.log('PASS bounded-influence rating properties');
