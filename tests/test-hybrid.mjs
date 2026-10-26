import assert from 'node:assert/strict';
import { rankingRatings } from '../packages/core/src/hybrid/ranking.js';
import { hybridRatings } from '../packages/core/src/hybrid/ratings.js';
import { HYBRID } from '../packages/core/src/presets/hybrid.js';

const pair = (x, y, cx, cy, same = false) => ({ x, y, cx, cy, same, o: 1, w: 1 });
const first = {
  year: 2024,
  rows: [
    { driverId: 'a', constructorId: 'X' },
    { driverId: 'b', constructorId: 'X' },
  ],
  raceObs: [pair('a', 'b', 'X', 'X', true)],
  qualObs: [],
};
const second = {
  year: 2024,
  rows: [
    { driverId: 'a', constructorId: 'Y' },
    { driverId: 'c', constructorId: 'Y' },
  ],
  raceObs: [pair('a', 'c', 'Y', 'Y', true)],
  qualObs: [],
};
const carOf = (id) => id;
const short = rankingRatings([first], carOf, [false]);
const full = rankingRatings([first, second], carOf, [false, false]);
assert.deepEqual(full.pre[0], short.pre[0], 'future weekends cannot change pre-weekend ranking levels');
assert.deepEqual(full.post[0], short.post[0], 'future weekends cannot change posted ranking levels');
assert.equal(full.pre[1].rated.get('a'), full.post[0].drivers.get('a').m, 'moving teams does not change the portable ranking level');
assert.ok(full.post[0].drivers.get('a').m > 0, 'the learner responds to teammate evidence');

const row = (m, sd = 5) => ({ m, sd });
const filterPre = (a, b, car, fit = 0) => ({
  rated: new Map([
    ['a', a],
    ['b', b],
  ]),
  drivers: new Map([
    ['a', a + fit],
    ['b', b - fit],
  ]),
  cars: new Map([
    ['X', car],
    ['Y', -car],
  ]),
});
const filterPost = (a, b, car) => ({
  drivers: new Map([
    ['a', row(a)],
    ['b', row(b)],
  ]),
  cars: new Map([
    ['X', row(car)],
    ['Y', row(-car)],
  ]),
});
const race = {
  pre: [filterPre(10, -10, 20, 2)],
  ratings: [filterPost(12, -12, 22)],
  predictions: [{ mean: Float64Array.from([20]), vari: Float64Array.from([9]) }],
  latest: null,
};
const qualifying = { pre: [filterPre(30, -30, 40)], ratings: [filterPost(32, -32, 42)] };
const blended = hybridRatings([first], [{ diag: { wet: false } }], race, qualifying, carOf);
const rankedPre = blended.ranking.pre[0];
const rankedPost = blended.ranking.post[0];
const driver = (r, q, o) =>
  (1 - HYBRID.rankingDriverShare) * ((1 - HYBRID.qualifyingDriverShare) * r + HYBRID.qualifyingDriverShare * q) +
  HYBRID.rankingDriverShare * o;
const car = (r, q) => (1 - HYBRID.qualifyingCarShare) * r + HYBRID.qualifyingCarShare * q;
assert.equal(blended.pre[0].rated.get('a'), driver(10, 30, rankedPre.rated.get('a')));
assert.equal(
  blended.pre[0].drivers.get('a'),
  driver(10, 30, rankedPre.rated.get('a')) + 2,
  'internal driver-car fit remains in forecast levels',
);
assert.equal(blended.pre[0].cars.get('X'), car(20, 40));
assert.equal(blended.ratings[0].drivers.get('a').m, driver(12, 32, rankedPost.drivers.get('a').m));
assert.equal(blended.ratings[0].cars.get('X').m, car(22, 42));
assert.equal(
  [...blended.ratings[0].drivers.values()].reduce((sum, value) => sum + value.m, 0),
  0,
  'drivers stay field-centred',
);
assert.equal(
  [...blended.ratings[0].cars.values()].reduce((sum, value) => sum + value.m, 0),
  0,
  'cars stay field-centred',
);
assert.equal(blended.ratings[0].drivers.get('a').sd, 5, 'the reported uncertainty is retained from the race filter');
assert.equal(blended.predictions[0].vari[0], 9, 'the forecast variance is retained from the race filter');
console.log('PASS hybrid: dated ranking, move continuity, fixed driver/car blends, retained filter variance');
