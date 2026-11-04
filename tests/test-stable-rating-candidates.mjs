import assert from 'node:assert/strict';
import { blendSession } from '../research/stable-ratings/candidates.mjs';

const map = (a, b) =>
  new Map([
    ['a', a],
    ['b', b],
  ]);
const cars = (x, y) =>
  new Map([
    ['x', x],
    ['y', y],
  ]);
const ratings = (values) => new Map([...values].map(([id, m]) => [id, { m, sd: 3, seen: true }]));
function filter(session, rated, effective, car, prediction) {
  const pre = [{ rated, drivers: effective, cars: car }];
  const post = [{ drivers: ratings(rated), cars: ratings(car) }];
  const predictions = [{ mean: Float64Array.of(prediction), vari: Float64Array.of(4) }];
  const latest = { driverIds: ['a', 'b'], carIds: ['x', 'y'], mean: Float64Array.of(...rated.values(), ...car.values()) };
  return { session, k: Math.LN10 / 75, pre, post, raw: { pre, ratings: post, predictions, latest } };
}
const race = filter('race', map(10, -10), map(15, -15), cars(20, -20), 70);
const qual = filter('qual', map(5, -5), map(8, -8), cars(10, -10), 36);
const timeline = [{ obs: { race: [{ x: 'a', y: 'b', cx: 'x', cy: 'y' }], qual: [{ x: 'a', y: 'b', cx: 'x', cy: 'y' }] } }];
const graph = [{ pre: { levels: map(30, -30) }, post: { levels: map(40, -40) } }];
const mixed = blendSession(timeline, 'race', race, qual, graph, 0.5);
assert.equal(mixed.pre[0].rated.get('a'), 19);
assert.equal(mixed.pre[0].drivers.get('a'), 24, 'effective driver retains fit offset');
assert.equal(mixed.pre[0].cars.get('x'), 17.5);
assert.equal(mixed.raw.predictions[0].mean[0], 83, 'prediction receives both driver and car corrections');
assert.equal(mixed.z[0].plain[0], mixed.k * 83);
assert.equal(mixed.post[0].drivers.get('a').m, 24);
assert.equal(mixed.raw.latest.mean[0], 24);
assert.equal(mixed.raw.latest.mean[2], 17.5);
assert.equal(mixed.raw.pre, mixed.pre);
assert.equal(mixed.raw.ratings, mixed.post);
const qualifying = blendSession(timeline, 'qual', race, qual, graph, 0.5);
assert.equal(qualifying.pre[0].rated.get('a'), 17.5);
assert.equal(qualifying.pre[0].drivers.get('a'), 20.5);
assert.equal(qualifying.pre[0].cars.get('x'), 10);
assert.equal(qualifying.raw.predictions[0].mean[0], 61);
const changedFuture = [{ ...graph[0], post: { levels: map(-100, 100) } }];
const before = blendSession(timeline, 'race', race, qual, changedFuture, 0.5);
assert.deepEqual(before.pre, mixed.pre, 'post-weekend graph does not affect the prior forecast');
assert.deepEqual(before.z, mixed.z);
assert.notDeepEqual(before.post, mixed.post);
console.log('PASS stable rating candidate means and chronology');
