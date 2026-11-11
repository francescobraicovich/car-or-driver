import assert from 'node:assert/strict';
import { jointEvidence, weekendMeasurements } from '../research/graph-evidence/evidence.mjs';
import { evaluateGraph, gapVariance } from '../research/graph-evidence/evaluation.mjs';
import { buildRaceObservations } from '../packages/core/src/observations.js';

const a = { driverId: 'a', constructorId: 'team' },
  b = { driverId: 'b', constructorId: 'team' };
const weekend = (year, observations, date = `${year}-01-01`) => ({
  info: { raceId: '1', year, date },
  rows: [a, b],
  replayObs: observations,
});
const qualify = (time = 81) => ({ session: 'qual', ob: { x: a, y: b, obs: 1, seg: 'q1', tx: 80, ty: time } });
const finish = { session: 'race', ob: { x: a, y: b, obs: 0, source: 'finish', base: 12 } };
const pace = { session: 'race', ob: { x: a, y: b, obs: 1, source: 'paceW', base: 0.75, gapSec: 1 } };
const laps = new Map([
  [
    '1',
    new Map([
      ['a', { win: [{ s: 2, med: 80, n: 8 }] }],
      ['b', { win: [{ s: 2, med: 81, n: 8 }] }],
    ]),
  ],
]);
const input = weekend(2020, [qualify(), finish, pace]);
const measurements = weekendMeasurements(input, laps);
assert.equal(measurements.length, 3);
assert.equal(
  measurements.filter((item) => item.session === 'race').reduce((sum, item) => sum + item.weight, 0),
  1.5,
);
assert.equal(measurements.find((item) => item.source === 'paceW').margin, 1 / 80.5);
assert.equal(measurements.find((item) => item.source === 'finish').outcome, -1);
assert.deepEqual(weekendMeasurements(weekend(2020, [...input.replayObs, ...input.replayObs]), laps), measurements);
assert.deepEqual(weekendMeasurements({ ...input, rows: [a, { ...b, constructorId: 'other' }] }, laps), []);
const reversed = {
  ...input,
  replayObs: input.replayObs.map(({ session, ob }) => ({
    session,
    ob: { ...ob, x: ob.y, y: ob.x, obs: 1 - ob.obs, tx: ob.ty, ty: ob.tx },
  })),
};
assert.deepEqual(weekendMeasurements(reversed, laps), measurements);
const partial = { session: 'race', ob: { x: a, y: b, obs: 1, source: 'partial', base: 0.4 } };
assert(Math.abs(weekendMeasurements(weekend(2020, [partial]), laps)[0].weight - 0.6) < 1e-12);
assert.equal(weekendMeasurements(weekend(2020, [pace, partial]), laps).length, 1);
assert.equal(weekendMeasurements(weekend(2020, [{ ...pace, ob: { ...pace.ob, base: 0.375 } }]), laps)[0].weight, 0.75);
const training = Array.from({ length: 24 }, (_, index) =>
  weekend(2019, [qualify(80.1 + (index % 7) * 0.1)], `2019-02-${String(index + 1).padStart(2, '0')}`),
);
const prefix = [...training, input];
const history = jointEvidence(prefix, laps);
const extended = jointEvidence([...prefix, weekend(2021, [qualify(150)])], laps);
assert.deepEqual(history, extended.slice(0, history.length));
assert.equal(history[0].observations[0].kind, 'binary');
assert.equal(history.at(-1).observations[0].kind, 'margin');
assert(history.at(-1).scales.qual > 0);
assert.equal(history.at(-1).observations.filter((item) => item.source === 'qual').length, 1);

const retired = { ...a, positionOrder: '2', statusName: 'Engine', laps: '12' };
const finisher = { ...b, positionOrder: '1', statusName: 'Finished', laps: '50' };
const mechanicalLaps = new Map([
  [
    '1',
    new Map([
      ['a', { n: 8, med: 80, win: [{ s: 2, n: 8, med: 80 }] }],
      ['b', { n: 8, med: 81, win: [{ s: 2, n: 8, med: 81 }] }],
    ]),
  ],
]);
const mechanicalEvidence = buildRaceObservations({
  rid: '1',
  rows: [finisher, retired],
  maxLaps: 50,
  lapPace: mechanicalLaps,
  lapSnapshots: new Map(),
  orderW: 12,
  paceW: 0.75,
  beta: 0.8,
});
const mechanical = weekendMeasurements(
  weekend(
    2020,
    mechanicalEvidence.observations.map((ob) => ({ session: 'race', ob })),
  ),
  mechanicalLaps,
);
assert.equal(mechanical.length, 1);
assert.equal(mechanical[0].source, 'paceW');
assert.equal(mechanical[0].outcome, 1, 'mechanical failure does not reverse valid pace evidence');

// Exercise the actual frozen scorer: changing all later means and covariance
// must leave the pre-transfer predictions untouched.
const ids = ['a', 'b', 'c', 'd'];
const timeline = Array.from({ length: 54 }, (_, index) => {
  const year = 2002 + Math.floor(index / 6);
  const teams = year < 2008 ? ['X', 'X', 'Y', 'Y'] : ['X', 'Y', 'X', 'Y'];
  const rows = ids.map((driverId, position) => ({ driverId, constructorId: teams[position] }));
  const race = [];
  for (let first = 0; first < ids.length; first++)
    for (let second = first + 1; second < ids.length; second++) {
      race.push({
        x: ids[first],
        y: ids[second],
        cx: teams[first],
        cy: teams[second],
        same: teams[first] === teams[second],
        o: index % 3 ? 1 : 0,
        w: 1,
        src: 'finish',
      });
    }
  return { i: index, year, raceId: String(index), rows, obs: { race, qual: race.map((ob) => ({ ...ob, src: 'qual' })) } };
});
const covariance = ids.map((_, i) => ids.map((_, j) => (i === j ? 0.5 : 0.1)));
const snapshot = () => ({
  ids,
  levels: { race: [10, 5, -5, -10], qual: [10, 5, -5, -10] },
  covariance: { race: covariance, qual: covariance },
});
const snapshots = timeline.map((item) => ({ raceId: item.raceId, pre: snapshot(), post: snapshot() }));
const environment = { timeline, prep: { ctx: { canon: (id) => id, carOf: (id) => id } } };
const options = { uncertainty: true, folds: [{ from: 2008, to: 2010 }] };
const original = evaluateGraph(environment, snapshots, options);
assert(original.movers.length > 0);
const changed = snapshots.map((item, index) =>
  index < 36
    ? item
    : {
        ...item,
        pre: {
          ...item.pre,
          levels: { race: [-100, 200, 300, -400], qual: [400, -300, -200, 100] },
          covariance: {
            race: covariance.map((row) => row.map((value) => value * 3)),
            qual: covariance.map((row) => row.map((value) => value * 3)),
          },
        },
      },
);
assert.deepEqual(evaluateGraph(environment, changed, options).movers, original.movers);
const revisedPrior = structuredClone(snapshots);
revisedPrior[35].pre.levels.race[1] += 20;
assert.notDeepEqual(evaluateGraph(environment, revisedPrior, options).movers, original.movers);
assert(Math.abs(gapVariance(snapshot(), 'race', 'a', 'b') - 0.8) < 1e-12);
console.log('PASS joint graph evidence, chronology, budgets and frozen covariance predictions');
