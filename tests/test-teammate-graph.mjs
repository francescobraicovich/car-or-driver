import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { csv } from '../packages/core/src/csv.js';
import { buildTeammateGraph } from '../tools/teammate-graph.mjs';

const row = (raceId, driverId, position, grid = 1) => ({ raceId, driverId, constructorId: 'x', position, grid });
const q = (raceId, driverId, q1) => ({ raceId, driverId, q1, q2: '\\N', q3: '\\N' });
const snaps = [
  { raceId: '1', year: 2020, round: 1, date: '2020-09-29', drivers: [{ driverId: 'a' }, { driverId: 'b' }] },
  { raceId: '2', year: 2020, round: 2, date: '2020-09-30', drivers: [{ driverId: 'b' }, { driverId: 'c' }] },
];
const drivers = [{ driverId: 'a', dob: '1997-09-30' }];
const results = [row('1', 'a', '1', 20), row('1', 'b', '2'), row('2', 'b', '2'), row('2', 'c', '1')];
const qualifying = [q('1', 'a', '1:20.000'), q('1', 'b', '1:21.000'), q('2', 'b', '1:20.000'), q('2', 'c', '1:21.000')];
const full = buildTeammateGraph(snaps, results, qualifying, drivers);
const prefix = buildTeammateGraph(snaps.slice(0, 1), results.slice(0, 2), qualifying.slice(0, 2), drivers);
assert.equal(full[0].nodes.find((node) => node[0] === 'a')[4], 22);
assert.equal(full[1].nodes.find((node) => node[0] === 'a')[4], 23);
assert.deepEqual(full[0], prefix[0], 'future races cannot change an earlier graph');
assert.deepEqual(full[0].duels, [['a', 'b', 1, 1]], 'grid penalty is not qualifying evidence');
assert(full[0].nodes.find((node) => node[0] === 'a')[1] > 1000);
assert(
  full[1].nodes.find((node) => node[0] === 'a')[1] > full[1].nodes.find((node) => node[0] === 'c')[1],
  'teammate paths should propagate a comparison',
);
const agedSnaps = [snaps[0], { ...snaps[1], year: 2025, date: '2025-09-30' }];
const aged = buildTeammateGraph(agedSnaps, results, qualifying, drivers);
const decayed = buildTeammateGraph(agedSnaps, results, qualifying, drivers, { halfLifeYears: 3 });
const gap = (snapshot, a, b) => snapshot.nodes.find((node) => node[0] === a)[1] - snapshot.nodes.find((node) => node[0] === b)[1];
assert.deepEqual(decayed[0], aged[0], 'decay cannot change an earlier graph');
assert(Math.abs(gap(decayed[1], 'a', 'b')) < Math.abs(gap(aged[1], 'a', 'b')), 'old teammate evidence should have less influence');
const published = JSON.parse(await readFile('data/teammate-graph.json', 'utf8'));
const model = JSON.parse(await readFile('data/model.json', 'utf8'));
assert.equal(published.sourceHash, model.sourceHash);
assert.deepEqual(
  published.snapshots.map((snap) => snap.raceId),
  model.model.snaps.map((snap) => snap.raceId),
);
assert(published.snapshots.at(-1).nodes.length >= model.model.snaps.at(-1).drivers.length);
const [resultsText, qualifyingText, driverText] = await Promise.all([
  readFile('data/results.csv', 'utf8'),
  readFile('data/qualifying.csv', 'utf8'),
  readFile('data/drivers.csv', 'utf8'),
]);
assert.deepEqual(
  published.snapshots,
  buildTeammateGraph(model.model.snaps, csv(resultsText), csv(qualifyingText), csv(driverText)),
  'the published graph must match a fresh forward-only build',
);
for (const [raceId, one, two] of [
  ['932', '8', '20'],
  ['1052', '20', '840'],
  ['1099', '846', '857'],
]) {
  const duel = published.snapshots.find((snap) => snap.raceId === raceId)?.duels.find((pair) => pair.includes(one) && pair.includes(two));
  assert.equal(duel?.[2], 0, `documented interrupted Q1 ${raceId} is not graph evidence`);
}
assert.ok(
  published.snapshots.find((snap) => snap.raceId === '1063')?.duels.every((duel) => duel[3] === 0),
  'the 2021 Belgian safety-car classification is not a race duel',
);
assert(
  published.snapshots.every((snap) =>
    snap.nodes.every((node) => Number.isFinite(node[1]) && Number.isFinite(node[2]) && (node[4] === null || Number.isInteger(node[4]))),
  ),
);
console.log('PASS teammate graph: no future leakage, grid penalty excluded, connected scores, published data');
