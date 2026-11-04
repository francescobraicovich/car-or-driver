import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  parseUtcTimestamp,
  precedingDataset,
  scoreWinner,
  summarize,
  winnerScores,
} from '../research/prediction-markets/forecast/winner-baseline.mjs';

const races = [
  { raceId: '1', date: '2026-01-01', round: 1, circuitId: '1' },
  { raceId: '2', date: '2026-01-08', round: 2, circuitId: '2' },
  { raceId: '3', date: '2026-01-15', round: 3, circuitId: '3' },
];
const context = {
  raw: {
    races,
    results: [
      { raceId: '1', driverId: 'a', constructorId: 'x' },
      { raceId: '1', driverId: 'b', constructorId: 'y' },
      { raceId: '2', driverId: 'c', constructorId: 'z' },
    ],
    qualifying: [{ raceId: '1' }, { raceId: '2' }],
    drivers: [{ driverId: 'a' }, { driverId: 'b' }, { driverId: 'c' }],
    constructors: [{ constructorId: 'x' }, { constructorId: 'y' }, { constructorId: 'z' }],
    circuits: [{ circuitId: '1' }, { circuitId: '2' }],
  },
  maps: {},
  lapSnapshots: new Map([
    ['1|5', 1],
    ['2|5', 2],
  ]),
  lapPace: new Map([
    ['1', 1],
    ['2', 2],
  ]),
};
const prefix = precedingDataset(context, '2026-01-07');
assert.equal(prefix.previousRace.raceId, '1');
assert.deepEqual(
  prefix.raw.results.map((row) => row.driverId),
  ['a', 'b'],
);
assert.deepEqual(
  prefix.raw.qualifying.map((row) => row.raceId),
  ['1'],
);
assert.deepEqual([...prefix.lapSnapshots.keys()], ['1|5']);
assert.deepEqual([...prefix.lapPace.keys()], ['1']);
const changedFuture = structuredClone(context);
changedFuture.raw.results[2].driverId = 'future-changed';
assert.deepEqual(precedingDataset(changedFuture, '2026-01-07').raw, prefix.raw, 'future result changes cannot alter the prefix');
const snapshot = {
  drivers: [
    { driverId: 'a', combined: 1000 },
    { driverId: 'b', combined: 1000 },
  ],
  cars: [
    { constructorId: 'x', combined: 1000 },
    { constructorId: 'y', combined: 1000 },
  ],
};
const entries = winnerScores(snapshot, prefix.raw.results);
assert.equal(entries[0].probability, 0.5);
assert.equal(entries[1].probability, 0.5);
assert.equal(scoreWinner(entries, 'a').brier, 0.5);
const missing = scoreWinner(entries, 'c');
assert.equal(missing.winnerInRoster, false);
assert.equal(missing.winnerProbability, 0);
assert.equal(missing.logLoss, null);
assert.equal(missing.brier, 1.5);
const summary = summarize([scoreWinner(entries, 'a'), missing]);
assert.equal(summary.missingWinners, 1);
assert.equal(summary.meanLogLoss, null);
assert.match(summary.logLossNote, /Infinite/);
assert.throws(() => precedingDataset(context, 'invalid'), /Invalid/);
assert.equal(parseUtcTimestamp('2026-06-25T14:00:00Z'), Date.parse('2026-06-25T14:00:00Z'));
assert.throws(() => parseUtcTimestamp('2026-06-25T14:00:00'), /UTC/);
assert.throws(() => parseUtcTimestamp('2026-06-25T14:00:00+02:00'), /UTC/);
assert.throws(() => parseUtcTimestamp('2026-02-30T14:00:00Z'), /Invalid/);
assert.throws(() => parseUtcTimestamp('2026-06-25T25:00:00Z'), /Invalid/);
assert.throws(() => winnerScores(snapshot, [...prefix.raw.results, prefix.raw.results[0]]), /Duplicate/);
assert.throws(() => winnerScores(snapshot, [{ driverId: 'c', constructorId: 'z' }]), /Missing rating/);
const invalidCli = spawnSync(
  process.execPath,
  ['research/prediction-markets/forecast/winner-baseline.mjs', '2026', '1176', '2026-06-25T14:00:00'],
  { encoding: 'utf8' },
);
assert.equal(invalidCli.status, 1);
assert.match(invalidCli.stderr, /UTC/);
console.log('PASS prefix-built winner score');
