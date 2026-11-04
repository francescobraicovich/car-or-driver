import assert from 'node:assert/strict';
import { persistentSession } from '../research/stable-ratings/persistent-candidates.mjs';

const values = (pairs) => new Map(pairs);
const ratings = (pairs) => new Map(pairs.map(([id, m]) => [id, { m, sd: 3, seen: true }]));
const cars = values([['x', 0]]);
const entries = [
  ['a', 0],
  ['b', 0],
];
const basePre = {
  rated: values(entries),
  drivers: values([
    ['a', 2],
    ['b', -2],
  ]),
  cars,
};
const basePost = {
  drivers: ratings([
    ['a', 20],
    ['b', -20],
  ]),
  cars: ratings([['x', 0]]),
};
const observations = [{ x: 'a', y: 'b', cx: 'x', cy: 'x' }];
const weekend = (race = observations) => ({ obs: { race, qual: [] } });
function base(count) {
  const pre = Array.from({ length: count }, () => basePre);
  const post = Array.from({ length: count }, () => basePost);
  const z = Array.from({ length: count }, () => ({ plain: Float64Array.of((4 * Math.LN10) / 75), vari: Float64Array.of(4) }));
  const predictions = Array.from({ length: count }, () => ({ mean: Float64Array.of(4), vari: Float64Array.of(4) }));
  const latest = { driverIds: ['a', 'b'], carIds: ['x'], mean: Float64Array.of(20, -20, 0) };
  return { session: 'race', k: Math.LN10 / 75, pre, post, z, raw: { pre, ratings: post, predictions, latest } };
}
const graph = (count) =>
  Array.from({ length: count }, () => ({
    post: {
      levels: values([
        ['a', 40],
        ['b', -40],
      ]),
    },
  }));
const two = persistentSession([weekend(), weekend()], base(2), graph(2), 0.25, 0.15);
assert.equal(two.pre[0].rated.get('a'), 0, 'first prior does not use post evidence');
assert.equal(two.post[0].drivers.get('a').m, 5.75);
assert.equal(two.pre[1].rated.get('a'), 5.75);
assert.equal(two.pre[1].drivers.get('a'), 7.75, 'effective fit is preserved');
assert(two.post[1].drivers.get('a').m > two.post[0].drivers.get('a').m, 'sustained evidence moves levels in its direction');
assert.equal(two.raw.predictions[1].mean[0], 15.5);
assert.equal(two.raw.latest.mean[0], two.post[1].drivers.get('a').m);
assert.equal(two.raw.pre, two.pre);
assert.equal(two.raw.ratings, two.post);
const prefix = persistentSession([weekend()], base(1), graph(1), 0.25, 0.15);
assert.deepEqual(two.pre[0], prefix.pre[0]);
assert.deepEqual(two.post[0], prefix.post[0], 'future evidence cannot alter an earlier state');
const emptyBase = base(2);
emptyBase.z[1] = { plain: new Float64Array(), vari: new Float64Array() };
emptyBase.raw.predictions[1] = { mean: new Float64Array(), vari: new Float64Array() };
const moved = persistentSession([weekend(), weekend([])], emptyBase, graph(2), 0.25, 0.15);
assert.equal(moved.post[1].drivers.get('a').m, moved.pre[1].rated.get('a'), 'no evidence at a move means no driver update');
const changedBirth = base(1);
changedBirth.post[0] = {
  ...basePost,
  drivers: ratings([
    ['a', -200],
    ['b', 200],
  ]),
};
const birth = persistentSession([weekend()], changedBirth, graph(1), 0.25, 0.15);
assert.deepEqual(birth.pre[0], prefix.pre[0], 'new driver prior is independent of the weekend outcome');
for (const alpha of [0.125, 0.25]) {
  const beforeMove = persistentSession([weekend()], base(1), graph(1), alpha, 0.15);
  const afterMove = persistentSession([weekend(), weekend([])], emptyBase, graph(2), alpha, 0.15);
  assert.equal(
    afterMove.pre[1].rated.get('a'),
    beforeMove.post[0].drivers.get('a').m,
    `a move cannot reset the previous driver state at alpha ${alpha}`,
  );
  assert.equal(afterMove.post[1].drivers.get('a').m, afterMove.pre[1].rated.get('a'));
}
for (const alpha of [0.125, 0.25]) {
  const changedTeam = base(3);
  changedTeam.pre[1] = {
    rated: values([
      ['a', 10],
      ['c', -10],
    ]),
    drivers: values([
      ['a', 12],
      ['c', -12],
    ]),
    cars,
  };
  changedTeam.post[1] = {
    drivers: ratings([
      ['a', 20],
      ['c', -20],
    ]),
    cars: ratings([['x', 0]]),
  };
  for (const i of [1, 2]) {
    changedTeam.z[i] = { plain: new Float64Array(), vari: new Float64Array() };
    changedTeam.raw.predictions[i] = { mean: new Float64Array(), vari: new Float64Array() };
  }
  const run = persistentSession([weekend(), weekend([]), weekend([])], changedTeam, null, alpha, 0);
  assert.equal(
    run.pre[2].rated.get('a'),
    run.post[0].drivers.get('a').m,
    `a new teammate does not reset an established driver when fields later match at alpha ${alpha}`,
  );
}
const underlying = base(1);
underlying.raw = {
  ...underlying.raw,
  ratings: [
    {
      ...basePost,
      drivers: ratings([
        ['a', 50],
        ['b', -50],
      ]),
    },
  ],
  latest: { ...underlying.raw.latest, mean: Float64Array.of(52, -52, 0) },
};
const underlyingRun = persistentSession([weekend()], underlying, graph(1), 0.25, 0.15);
assert.equal(
  underlyingRun.raw.latest.mean[0],
  52 + underlyingRun.post[0].drivers.get('a').m - 50,
  'latest applies the correction to the underlying filter state rather than the hybrid snapshot',
);
const missingGraph = [{ post: { levels: values([['a', 40]]) } }];
assert.throws(() => persistentSession([weekend()], base(1), missingGraph, 0.25, 0.15), /Missing or invalid graph level/);
const invalidGraph = [
  {
    post: {
      levels: values([
        ['a', 40],
        ['b', NaN],
      ]),
    },
  },
];
assert.throws(() => persistentSession([weekend()], base(1), invalidGraph, 0.25, 0.15), /Missing or invalid graph level/);
console.log('PASS persistent rating candidate chronology, update and raw consistency');
