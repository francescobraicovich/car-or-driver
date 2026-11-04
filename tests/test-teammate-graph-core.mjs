import assert from 'node:assert/strict';
import { createTeammateGraph } from '../packages/core/src/teammate-graph.js';

const observation = (a, b, outcome = 1, weight = 1) => ({ a, b, outcome, weight });
const graph = () => createTeammateGraph({ halfLifeYears: 1 });
const difference = (state, a, b) => state.levels.get(a) - state.levels.get(b);
const full = graph();
const first = full.advance('2020-01-01', ['a', 'b'], [observation('a', 'b', 1, 80)]);
const second = full.advance('2021-01-01', ['b', 'c'], [observation('b', 'c')]);
const prefix = graph().advance('2020-01-01', ['a', 'b'], [observation('a', 'b', 1, 80)]);
assert.deepEqual(first, prefix, 'future weekends cannot change earlier states');
assert.equal(first.pre.evidence.length, 0);
assert.equal(first.pre.levels.get('a'), 0);
const thetaA = (first.post.levels.get('a') * Math.LN10) / 75;
const thetaB = (first.post.levels.get('b') * Math.LN10) / 75;
const chance = 1 / (1 + Math.exp(-(thetaA - thetaB)));
assert(Math.abs(2 * thetaA + 80 * (chance - 1)) < 1e-7, 'score solves the ridge Bradley–Terry objective');

assert(first.post.evidence[0].weight > 60, 'evidence precision does not saturate at 60');
assert(second.pre.evidence[0].wins < 41 && second.pre.evidence[0].wins > 39, 'calendar-year half-life');
assert.equal(second.pre.evidence.length, 1, 'pre state excludes current observations');
assert.equal(second.post.evidence.length, 2);
assert(second.post.levels.get('a') > second.post.levels.get('c'), 'indirect evidence connects teammates');

const direct = graph().advance('2020-01-01', ['a', 'c'], [observation('a', 'c', 1, 8)]).post;
const indirect = graph().advance('2020-01-01', ['a', 'b', 'c'], [observation('a', 'b', 1, 8), observation('b', 'c', 1, 8)]).post;
assert(
  difference(direct, 'a', 'c') > difference(indirect, 'a', 'c') / 2,
  'an equally supported direct comparison has greater precision than an indirect path',
);
// Both constructions have essentially identical per-edge information near 50%.
// Split the same small end-to-end signal across the two-edge path.
const matchedDirect = graph().advance('2020-01-01', ['a', 'c'], [observation('a', 'c', 1, 8.001), observation('a', 'c', -1, 8)]).post;
const matchedIndirect = graph().advance(
  '2020-01-01',
  ['a', 'b', 'c'],
  [observation('a', 'b', 1, 8.0005), observation('a', 'b', -1, 8), observation('b', 'c', 1, 8.0005), observation('b', 'c', -1, 8)],
).post;
assert(
  difference(matchedDirect, 'a', 'c') > difference(matchedIndirect, 'a', 'c'),
  'the solver weights matched direct information more than a two-edge path',
);
const conflicting = graph().advance(
  '2020-01-01',
  ['a', 'b', 'c'],
  [observation('a', 'c', -1), observation('a', 'b', 1, 100), observation('b', 'c', 1, 100)],
).post;
assert(difference(conflicting, 'a', 'c') > 0, 'abundant indirect evidence can outweigh a weak direct observation');
const stronger = graph().advance('2020-01-01', ['a', 'c'], [observation('a', 'c', 1, 100)]).post;
assert(stronger.evidence[0].weight > direct.evidence[0].weight);
assert(difference(stronger, 'a', 'c') > difference(direct, 'a', 'c'));
assert.throws(() => createTeammateGraph({ halfLifeYears: 0 }), RangeError);
assert.throws(() => graph().advance('2020-02-30', [], []), RangeError);
assert.throws(() => full.advance('2020-01-01', [], []), RangeError);
assert.throws(() => graph().advance('2020-01-01', [], [observation('a', 'a')]), RangeError);
console.log('PASS dated teammate graph core');
