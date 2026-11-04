import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectSignals, buildRaceSignals, selectCases } from '../research/prediction-markets/pmdata/strategy-features.mjs';
import { precedingDataset } from '../research/prediction-markets/forecast/winner-baseline.mjs';

const snapshot = {
  drivers: [
    { driverId: '1', constructorId: 'a', combined: 1020 },
    { driverId: '2', constructorId: 'a', combined: 1000 },
    { driverId: '3', constructorId: 'b', combined: 990 },
  ],
  cars: [
    { constructorId: 'a', combined: 1010 },
    { constructorId: 'b', combined: 1000 },
  ],
};
const roster = snapshot.drivers.map(({ driverId, constructorId }) => ({ driverId, constructorId }));
const names = new Map([
  ['1', 'First Driver'],
  ['2', 'Second Driver'],
  ['3', 'Third Driver'],
]);
const logistic = (x) => 1 / (1 + Math.exp(-x));
const form = { 1: 0.4, 2: -0.2, 3: 0.1 };
const level = { 1: 0.8, 2: 0.4, 3: -0.3 };
const forecast = (a, b) => ({
  breakdown: { full: logistic(level[a] - level[b] + form[a] - form[b]), calibrated: logistic(level[a] - level[b]) },
});
const features = projectSignals(snapshot, roster, names, forecast);
const byId = new Map(features.map((row) => [row.driverId, row]));
assert.ok(Math.abs(features.reduce((sum, row) => sum + row.baselineProbability, 0) - 1) < 1e-12);
assert.ok(Math.abs(features.reduce((sum, row) => sum + row.formShift, 0)) < 1e-12);
assert.ok(Math.abs(byId.get('1').teammateFormShift - 0.3) < 1e-12);
assert.ok(Math.abs(byId.get('2').teammateFormShift + 0.3) < 1e-12);
assert.equal(byId.get('3').teammateFormShift, 0);
assert.equal(byId.get('1').carRating, 1010);
assert.ok(Math.abs(features.reduce((sum, row) => sum + row.fullHeadStrength, 0)) < 1e-12);
const reordered = new Map(projectSignals(snapshot, [...roster].reverse(), names, forecast).map((row) => [row.driverId, row]));
for (const id of byId.keys())
  for (const key of ['baselineProbability', 'formShift', 'teammateFormShift', 'fullHeadStrength']) {
    assert.ok(Math.abs(byId.get(id)[key] - reordered.get(id)[key]) < 1e-12, `${id} ${key} should be permutation invariant`);
  }
assert.throws(() => projectSignals(snapshot, roster, new Map(), forecast), /name or ratings/);
assert.throws(() => projectSignals(snapshot, [roster[0], roster[0]], names, forecast), /Duplicate driver/);
assert.throws(() => projectSignals(snapshot, roster, names, () => ({ breakdown: { full: NaN, calibrated: 0.5 } })), /Invalid pairwise/);
assert.throws(
  () => buildRaceSignals({}, { date: '2026-06-28', fp1_date: '2026-06-26', fp1_time: '11:30:00' }, '2026-06-26T11:30:00Z'),
  /precede first practice/,
);

const context = {
  raw: {
    races: [
      { raceId: '1', date: '2026-06-21', round: 1 },
      { raceId: '2', date: '2026-06-25', round: 2 },
      { raceId: '3', date: '2026-06-28', round: 3 },
    ],
    results: [
      { raceId: '1', driverId: '1', constructorId: 'a' },
      { raceId: '2', driverId: '2', constructorId: 'a' },
      { raceId: '3', driverId: '3', constructorId: 'b' },
    ],
    qualifying: [{ raceId: '1' }, { raceId: '2' }, { raceId: '3' }],
    drivers: [{ driverId: '1' }, { driverId: '2' }, { driverId: '3' }],
    constructors: [{ constructorId: 'a' }, { constructorId: 'b' }],
    circuits: [],
  },
  maps: {},
  lapSnapshots: new Map([
    ['1|1', {}],
    ['2|2', {}],
    ['3|3', {}],
  ]),
  lapPace: new Map([
    ['1', {}],
    ['2', {}],
    ['3', {}],
  ]),
};
const prefix = precedingDataset(context, '2026-06-25');
assert.deepEqual(
  prefix.raw.races.map((race) => race.raceId),
  ['1'],
);
assert.deepEqual(
  prefix.raw.results.map((row) => row.raceId),
  ['1'],
);
assert.deepEqual([...prefix.lapSnapshots.keys()], ['1|1']);
assert.deepEqual([...prefix.lapPace.keys()], ['1']);
const study = selectCases([]),
  midnight = selectCases(['--utc-midnight']);
assert.equal(study.length, 7);
assert.deepEqual(
  midnight.map(([id]) => id),
  study.map(([id]) => id),
);
assert.ok(midnight.every(([, time], index) => time === `${study[index][1].slice(0, 10)}T00:00:00Z`));
assert.deepEqual(
  selectCases(['--earlier-training']).map(([id]) => id),
  ['1173', '1174', '1175'],
);
assert.ok(selectCases(['--earlier-training', '--utc-midnight']).every(([, time]) => time.endsWith('T00:00:00Z')));
assert.throws(() => selectCases(['--utc-midnight', '--utc-midnight']), /Supported options/);
assert.throws(() => selectCases(['--future-data']), /Supported options/);
const generated = (name) => JSON.parse(readFileSync(new URL(`../research/prediction-markets/pmdata/${name}`, import.meta.url), 'utf8'));
const standardRecords = generated('strategy-features.json').races;
const midnightRecords = generated('strategy-features-midnight.json').races;
assert.equal(standardRecords.length, 7);
assert.equal(midnightRecords.length, 7);
for (let index = 0; index < standardRecords.length; index++) {
  const { decisionTime: daytime, ...dayFeatures } = standardRecords[index];
  const { decisionTime: midnightAt, ...midnightFeatures } = midnightRecords[index];
  assert.equal(daytime.slice(0, 10), midnightAt.slice(0, 10));
  assert.ok(midnightAt.endsWith('T00:00:00.000Z'));
  assert.deepEqual(midnightFeatures, dayFeatures);
}
assert.deepEqual(
  generated('strategy-features-earlier.json').races.map((race) => race.raceId),
  ['1173', '1174', '1175'],
);
console.log('PASS pre-practice projected model signals and strict calendar-date prefix');
