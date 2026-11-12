import assert from 'node:assert/strict';
import { retrospectiveModel } from '../tools/build-retrospective.mjs';
import { gapVariance } from '../packages/core/src/unified/forecast.js';
import { withAnnualUncertainty } from '../site/js/retrospective-uncertainty.js';

const row = (id, kind) => ({
  [kind === 'driver' ? 'driverId' : 'constructorId']: id,
  ...(kind === 'car' ? { carId: id } : {}),
  name: id,
  qual: 1000,
  race: 1000,
  overall: 1000,
});
const snapshot = (raceId) => ({
  raceId,
  year: 2000,
  round: Number(raceId),
  date: `2000-01-0${raceId}`,
  drivers: [row('d', 'driver')],
  cars: [row('c', 'car')],
  unified: {
    keys: [
      ['driver', 'd'],
      ['car', 'c'],
    ],
    covariance: [
      [1, 0],
      [0, 1],
    ],
  },
});
const model = { snaps: [snapshot('1'), snapshot('2')] };
const input = model.snaps.map((snap) => ({ raceId: snap.raceId, observations: [] }));
const matrix = Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => (i === j ? 2 : 0)));
const posterior = {
  keys: [
    ['driver', 'd'],
    ['car', 'c'],
  ],
  matrix,
  standardDeviation: { driver: { d: [3, 4, 5] }, car: { c: [6, 7, 8] } },
};
const result = { offset: 1, history: [{}, { driver: { d: [10, 11, 12] }, car: { c: [20, 21, 22] } }, {}], covariance: { 1: posterior } };
const retrospective = retrospectiveModel(model, result, [{ raceId: 'warmup' }, ...input], input);
assert.equal(retrospective.snaps[0].drivers[0].overall, 1012);
assert.equal(retrospective.snaps[0].cars[0].overallSd, undefined);
assert.deepEqual(retrospective.annualUncertainty['2000'], { driver: [3, 4, 5], car: [6, 7, 8] });
const approximate = withAnnualUncertainty(retrospective);
assert.equal(approximate.snaps[0].cars[0].overallSd, 8);
assert.equal(retrospective.dh.get('d')[0].overall, 1012);
assert.ok(
  Math.abs(
    gapVariance(approximate.snaps[0].unified, [
      ['driver', 'd', 1],
      ['car', 'c', -1],
    ]) -
      (5 ** 2 + 8 ** 2) / (75 / Math.LN10) ** 2,
  ) < 1e-12,
);
assert.equal(retrospective.snaps[1], model.snaps[1], 'the current state remains filtered');
assert.equal(model.snaps[0].drivers[0].overall, 1000, 'the filtered model is unchanged');
assert.throws(
  () => retrospectiveModel(model, result, [{ raceId: 'warmup' }, { raceId: '1', observations: [1] }, input[1]], input),
  /evidence/,
);
assert.throws(() => retrospectiveModel(model, { ...result, covariance: {} }, [{ raceId: 'warmup' }, ...input], input), /covariance/);

const longer = { snaps: [1, 2, 3, 4, 5].map((id) => snapshot(String(id))) };
const longerInputs = longer.snaps.map((snap) => ({ raceId: snap.raceId, observations: [] }));
const sampled = (value) => ({
  ...posterior,
  standardDeviation: { driver: { d: [value, value, value] }, car: { c: [value + 1, value + 1, value + 1] } },
});
const longerResult = {
  offset: 1,
  history: [{}, ...longer.snaps.map(() => ({ driver: { d: [1, 2, 3] }, car: { c: [4, 5, 6] } }))],
  covariance: { 1: sampled(5), 3: sampled(15), 4: sampled(25) },
};
const averaged = retrospectiveModel(longer, longerResult, [{ raceId: 'warmup' }, ...longerInputs], longerInputs);
assert.deepEqual(averaged.annualUncertainty['2000'], { driver: [15, 15, 15], car: [16, 16, 16] });
assert.equal(averaged.snaps[1].unified, undefined, 'historical covariance is not shipped');
console.log('PASS retrospective projection and causal boundary');
