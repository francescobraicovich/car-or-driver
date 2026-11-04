import assert from 'node:assert/strict';
import { createTeammateGraph } from '../research/temporal-graph/static-teammate-graph.mjs';
import { createTemporalTeammateGraph } from '../research/temporal-graph/temporal-teammate-graph.mjs';

const make = () => createTemporalTeammateGraph({ halfLifeYears: 3, annualDriftPoints: 4 });
const duel = (a, b, outcome = 1, weight = 1) => ({ a, b, outcome, weight });
const gap = (state, a, b) => state.levels.get(a) - state.levels.get(b);
const difference = (x, y) => Math.abs(x - y);
const dates = ['2020-01-01', '2020-01-02', '2020-01-03'];
const history = [duel('alonso', 'massa', 1, 12), duel('massa', 'button', 1, 7)];
const temporal = make();
const fixed = createTeammateGraph({ halfLifeYears: 3 });
const first = temporal.advance(dates[0], ['alonso', 'massa', 'button'], history);
const fixedFirst = fixed.advance(dates[0], ['alonso', 'massa', 'button'], history);
for (const id of first.post.levels.keys())
  assert(difference(first.post.levels.get(id), fixedFirst.post.levels.get(id)) < 1e-6, 'one-season graph agrees with existing model');
const next = temporal.advance(dates[1], ['alonso', 'massa'], [duel('alonso', 'massa', -1)]);
const fixedNext = fixed.advance(dates[1], ['alonso', 'massa'], [duel('alonso', 'massa', -1)]);
for (const [id, value] of next.post.levels)
  assert(difference(value, fixedNext.post.levels.get(id)) < 1e-6, 'within-season updates agree with the existing graph');
assert(
  next.post.evidence.find((edge) => edge.a === 'alonso' && edge.b === 'massa').weight >
    next.pre.evidence.find((edge) => edge.a === 'alonso' && edge.b === 'massa').weight,
  'another equally valid race adds effective evidence',
);
const prefix = make().advance(dates[0], ['alonso', 'massa', 'button'], history);
assert.deepEqual(first, prefix, 'future evidence cannot change stored earlier states');
assert(
  gap(next.post, 'alonso', 'massa') < gap(next.pre, 'alonso', 'massa'),
  'a teammate upset moves the direct comparison in its direction',
);
const favored = make();
favored.advance(dates[0], ['alonso', 'massa', 'button'], history);
const expected = favored.advance(dates[1], ['alonso', 'massa'], [duel('alonso', 'massa', 1)]);
assert(
  gap(next.pre, 'alonso', 'massa') - gap(next.post, 'alonso', 'massa') >
    gap(expected.post, 'alonso', 'massa') - gap(expected.pre, 'alonso', 'massa'),
);
const direct = make().advance('2020-01-01', ['a', 'c'], [duel('a', 'c', 1, 8.001), duel('a', 'c', -1, 8)]).post;
const indirect = make().advance(
  '2020-01-01',
  ['a', 'b', 'c'],
  [duel('a', 'b', 1, 8.0005), duel('a', 'b', -1, 8), duel('b', 'c', 1, 8.0005), duel('b', 'c', -1, 8)],
).post;
assert(gap(direct, 'a', 'c') > gap(indirect, 'a', 'c'), 'matched direct evidence is stronger than a serial path');
const older = make();
older.advance('2015-01-01', ['alonso', 'massa'], [duel('alonso', 'massa', 1, 10)]);
const oldState = older.advance('2020-01-01', ['alonso', 'massa'], [duel('alonso', 'massa', -1, 10)]);
const recent = make();
recent.advance('2019-12-31', ['alonso', 'massa'], [duel('alonso', 'massa', 1, 10)]);
const recentState = recent.advance('2020-01-01', ['alonso', 'massa'], [duel('alonso', 'massa', -1, 10)]);
assert(gap(oldState.post, 'alonso', 'massa') < gap(recentState.post, 'alonso', 'massa'), 'older evidence has less influence');
const move = make(),
  control = make();
for (const model of [move, control]) model.advance('2020-01-01', ['alonso', 'massa'], [duel('alonso', 'massa', 1, 10)]);
const moved = move.advance('2021-01-01', ['alonso'], []);
const unchanged = control.advance('2021-01-01', [], []);
for (const id of ['alonso', 'massa'])
  assert(
    difference(moved.post.levels.get(id), unchanged.post.levels.get(id)) < 1e-6,
    'node insertion alone cannot change an equally dated state',
  );
assert.deepEqual(moved.pre, moved.post);

// Changing Massa's later level connects through a time link, not as the same node.
function trajectory(creator, outcome) {
  const model = creator();
  model.advance('2020-01-01', ['alonso', 'massa', 'button'], [duel('alonso', 'massa', 1, 20), duel('massa', 'button', 1, 20)]);
  return model.advance('2024-01-01', ['massa', 'button'], [duel('massa', 'button', outcome, 200)]).post.levels.get('alonso');
}
const temporalShift = difference(trajectory(make, 1), trajectory(make, -1));
const staticShift = difference(
  trajectory(() => createTeammateGraph({ halfLifeYears: 3 }), 1),
  trajectory(() => createTeammateGraph({ halfLifeYears: 3 }), -1),
);
assert(temporalShift > 0 && temporalShift < staticShift, 'later Massa evidence propagates through a less-than-perfect temporal link');
assert.throws(() => createTemporalTeammateGraph({ halfLifeYears: 3, annualDriftPoints: 0 }), RangeError);
assert.throws(() => make().advance('2020-02-30', [], []), RangeError);
console.log('PASS temporal teammate graph: time-linked comparisons, decay, direction and causality');
