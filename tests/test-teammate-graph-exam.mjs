import assert from 'node:assert/strict';
import { teammateGraphExam } from '../packages/core/src/teammate-graph-exam.js';
import { buildRaceObservations } from '../packages/core/src/observations.js';

const a = { driverId: 'a', constructorId: 'team' };
const b = { driverId: 'b', constructorId: 'team' };
const qualify = (x, y, win = 1) => ({ x, y, obs: win, seg: 'q1', tx: 80, ty: 81 });
const race = (x, y, source, base, win = 1) => ({ x, y, obs: win, source, base });
const weekend = (date, rows, replayObs, raceId = date) => ({ info: { date, raceId }, rows, replayObs });
const entry = (ob, session) => ({ ob, session });
const run = (weekends) => teammateGraphExam(weekends, { halfLifeYears: 3 });
const state = (replayObs) => run([weekend('2020-01-01', [a, b], replayObs)])[0].post;
const gap = (snapshot) => snapshot.levels.get('a') - snapshot.levels.get('b');

const mixed = [entry(qualify(a, b), 'qual'), entry(race(a, b, 'paceW', 0.375, 0), 'race'), entry(race(a, b, 'finish', 12), 'race')];
const original = state(mixed);
assert.equal(original.evidence[0].wins, 2.5, 'finish replaces, rather than duplicates, pace evidence');
assert.equal(original.evidence[0].losses, 0);
const reversed = mixed.map(({ ob, session }) => ({ ob: { ...ob, x: ob.y, y: ob.x, obs: 1 - ob.obs, tx: ob.ty, ty: ob.tx }, session }));
assert.deepEqual(state(reversed), original, 'swapping pair orientation preserves graph');
assert.deepEqual(state([...mixed].reverse()), original, 'row ordering preserves graph');
const coverage = state([entry(race(a, b, 'paceW', 0.375), 'race')]);
assert.equal(coverage.evidence[0].wins, 0.75);
assert.equal(state([entry(race(a, b, 'paceW', 100), 'race')]).evidence[0].wins, 1.5, 'coverage is capped');
assert(Math.abs(state([entry(race(a, b, 'partial', 0.3), 'race')]).evidence[0].wins - 0.45) < 1e-12);
assert.equal(state([entry({ ...qualify(a, b), seg: null }, 'qual')]).evidence.length, 0);
const differentTeam = { ...b, constructorId: 'other' };
assert.equal(run([weekend('2020-01-01', [a, differentTeam], mixed)])[0].post.evidence.length, 0);

const dates = ['2020-01-01', '2020-01-02', '2020-01-03'];
const initial = Array.from({ length: 5 }, (_, index) =>
  weekend(`2019-01-0${index + 1}`, [a, b], [entry(race(a, b, 'finish', 12), 'race')]),
);
const expected = run([...initial, weekend(dates[1], [a, b], [entry(race(a, b, 'finish', 12), 'race')])]).at(-1);
const upset = run([...initial, weekend(dates[1], [a, b], [entry(race(a, b, 'finish', 12, 0), 'race')])]).at(-1);
assert(gap(expected.post) > gap(expected.pre), 'a teammate win increases the winner’s relative score');
assert(gap(expected.pre) - gap(upset.post) > gap(expected.post) - gap(expected.pre), 'an upset moves the rating more than an expected win');
assert(expected.post.evidence[0].weight > expected.pre.evidence[0].weight, 'another race adds effective information');
const onePrior = initial.slice(0, 1);
const expectedAfterOne = run([...onePrior, weekend(dates[1], [a, b], [entry(race(a, b, 'finish', 12), 'race')])]).at(-1);
const upsetAfterOne = run([...onePrior, weekend(dates[1], [a, b], [entry(race(a, b, 'finish', 12, 0), 'race')])]).at(-1);
assert(
  gap(expectedAfterOne.pre) - gap(upsetAfterOne.post) > gap(expectedAfterOne.post) - gap(expectedAfterOne.pre),
  'an upset moves the rating more than an expected win even after one prior win',
);
const probability = (difference) => 1 / (1 + Math.exp((-difference * Math.LN10) / 75));
assert(
  Math.abs(probability(gap(expected.post)) + probability(-gap(expected.post)) - 1) < 1e-12,
  'graph-implied pair probabilities are complementary',
);

const moved = run([...initial, weekend(dates[2], [a, differentTeam], [])]).at(-1);
assert.deepEqual(moved.pre, moved.post, 'a team move without observations adds no evidence');

const retired = { ...a, positionOrder: '2', statusName: 'Engine', laps: '12' };
const finisher = { ...b, positionOrder: '1', statusName: 'Finished', laps: '50' };
const pace = new Map([
  [
    'race',
    new Map([
      ['a', { n: 8, med: 80, win: [{ s: 1, n: 8, med: 80 }] }],
      ['b', { n: 8, med: 81, win: [{ s: 1, n: 8, med: 81 }] }],
    ]),
  ],
]);
const built = buildRaceObservations({
  rid: 'race',
  rows: [finisher, retired],
  maxLaps: 50,
  lapPace: pace,
  lapSnapshots: new Map(),
  orderW: 12,
  paceW: 0.75,
  beta: 0.8,
});
const mechanical = state(built.observations.map((ob) => entry(ob, 'race')));
assert.equal(mechanical.evidence[0].wins, 0.75, 'valid pre-retirement pace remains evidence');
assert.equal(mechanical.evidence[0].losses, 0, 'mechanical retirement is not a finishing defeat');
console.log('PASS teammate graph exam adapter');
