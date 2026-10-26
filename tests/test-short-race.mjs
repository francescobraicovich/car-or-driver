import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildRaceObservations } from '../packages/core/src/observations.js';

const rows = [
  { driverId: 'a', constructorId: 'x', statusName: 'Finished', positionOrder: '1', laps: '1' },
  { driverId: 'b', constructorId: 'y', statusName: 'Finished', positionOrder: '2', laps: '1' },
];
const options = { rid: 'test', rows, lapPace: null, lapSnapshots: new Map(), orderW: 12, paceW: 0.75, beta: 0.8 };
assert.deepEqual(buildRaceObservations({ ...options, maxLaps: 1 }).observations, [], 'one classified lap is no race-pace evidence');
assert.equal(buildRaceObservations({ ...options, maxLaps: 2 }).observations.length, 1, 'a real short race retains finish evidence');
const model = JSON.parse(await readFile('data/model.json', 'utf8'));
const spa = model.model.snaps.find((snap) => snap.raceId === '1063');
assert.equal(spa?.diag.obsCount, 0, 'the published 2021 Belgian GP has no race observations');
assert.ok(spa.diag.q.obsCount > 0, 'qualifying evidence remains');
console.log('PASS one-lap safety-car classification is not treated as race pace');
