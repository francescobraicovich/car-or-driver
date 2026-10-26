import assert from 'node:assert/strict';
import { buildRaceObservations } from '../packages/core/src/observations.js';
import { loadData } from '../packages/research/node/common.mjs';
import { prepareWeekends } from '../packages/core/src/weekends.js';

const rows = [
  { driverId: 'a', constructorId: 'x', statusName: 'Finished', positionOrder: '1', laps: '50' },
  { driverId: 'b', constructorId: 'y', statusName: 'Finished', positionOrder: '2', laps: '4' },
];
const pace = new Map([
  ['a', { med: 80, n: 8, win: [{ s: 10, med: 80, n: 8 }] }],
  ['b', { med: 140, n: 4, win: [{ s: 2, med: 140, n: 4 }] }],
]);
const options = {
  rid: 'test',
  rows,
  maxLaps: 50,
  lapPace: new Map([['test', pace]]),
  lapSnapshots: new Map(),
  orderW: 0,
  paceW: 1,
  beta: 0.8,
};
assert.deepEqual(buildRaceObservations(options).observations, [], 'disjoint race windows cannot prove a pace difference');
pace.get('a').win.unshift({ s: 2, med: 139, n: 4 });
assert.equal(buildRaceObservations(options).observations.length, 1, 'shared clean laps remain pace evidence');

const data = await loadData();
const weekends = prepareWeekends(data.raw).weekends;
const imola = weekends.find((weekend) => weekend.rid === '259');
assert.equal(imola?.info.year, 1994);
const observed = buildRaceObservations({
  rid: imola.rid,
  rows: imola.rows,
  maxLaps: imola.maxLaps,
  lapPace: data.lapPace,
  lapSnapshots: data.lapSnapshots,
  orderW: 12,
  paceW: 0.75,
  beta: 0.8,
}).observations;
assert.ok(
  !observed.some((ob) => ob.source === 'paceW' && [ob.x.driverId, ob.y.driverId].includes('102')),
  'Senna’s safety-car laps at Imola 1994 are not compared with later green-flag pace',
);
for (const [raceId, driverId] of [
  ['903', '16'], // Sutil: engine fault from the formation lap
  ['913', '3'], // Rosberg: electrical fault from the start
]) {
  const weekend = weekends.find((one) => one.rid === raceId);
  const obs = buildRaceObservations({
    rid: weekend.rid,
    rows: weekend.rows,
    maxLaps: weekend.maxLaps,
    lapPace: data.lapPace,
    lapSnapshots: data.lapSnapshots,
    orderW: 12,
    paceW: 0.75,
    beta: 0.8,
  }).observations;
  assert.ok(!obs.some((ob) => [ob.x.driverId, ob.y.driverId].includes(driverId)), `mechanically compromised stint ${raceId} is censored`);
}
console.log('PASS race pace uses shared clean windows and censors early mechanical failures');
