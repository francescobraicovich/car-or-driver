import assert from 'node:assert/strict';
import { assessGpRefresh, mergeGpRefresh } from '../tools/refresh-gp-data.mjs';

const records = (header, rows) => `${header.join(',')}\n${rows.map((row) => row.join(',')).join('\n')}\n`;
const race = (id, round, date) => [id, 2026, round, `Race ${round}`, date];
const resultRows = (id) => Array.from({ length: 20 }, (_, i) => [Number(id) * 100 + i, id, i + 1, i + 1]);
const qualRows = (id) => Array.from({ length: 20 }, (_, i) => [Number(id) * 100 + i, id, i + 1]);
const lapRows = (id) => Array.from({ length: 20 }, (_, i) => Array.from({ length: 10 }, (_, lap) => [id, i + 1, lap + 1])).flat();

function snapshot({ next = false, partial = false, editedOld = false, gap = false } = {}) {
  const ids = next ? (gap ? ['1', '3'] : ['1', '2']) : ['1'];
  const last = ids.at(-1);
  const latestRows = partial ? resultRows(last).slice(0, 5) : resultRows(last);
  const results = next ? [...resultRows('1'), ...latestRows] : resultRows('1');
  if (editedOld) results[0][3] = 99;
  return {
    'races.csv': records(
      ['raceId', 'year', 'round', 'name', 'date'],
      gap
        ? [race(1, 17, '2026-10-11'), race(2, 18, '2026-10-18'), race(3, 19, '2026-10-25')]
        : [race(1, 17, '2026-10-11'), race(2, 18, '2026-10-18')],
    ),
    'results.csv': records(['resultId', 'raceId', 'driverId', 'positionOrder'], results),
    'qualifying.csv': records(['qualifyId', 'raceId', 'driverId'], ids.flatMap(qualRows)),
    'lap_times.csv': records(['raceId', 'driverId', 'lap'], ids.flatMap(lapRows)),
    'drivers.csv': records(['driverId', 'name'], [[1, 'Driver One']]),
    'constructors.csv': records(['constructorId', 'name'], [[1, 'Team One']]),
    'status.csv': records(['statusId', 'status'], [[1, 'Finished']]),
    'circuits.csv': records(['circuitId', 'name'], [[1, 'Circuit One']]),
  };
}

const old = snapshot();
assert.equal(assessGpRefresh(old, old, new Date('2026-10-26')).updated, false, 'unchanged source does not trigger a build');
const accepted = assessGpRefresh(old, snapshot({ next: true }), new Date('2026-10-26'));
assert.equal(accepted.updated, true);
assert.equal(accepted.latest.round, '18');
assert.deepEqual(
  accepted.added.map((race) => race.raceId),
  ['2'],
);
assert.throws(() => assessGpRefresh(old, snapshot({ next: true, partial: true }), new Date('2026-10-26')), /incomplete/);
const corrected = snapshot({ next: true, editedOld: true });
const correctionAssessment = assessGpRefresh(old, corrected, new Date('2026-10-26'));
assert.equal(correctionAssessment.historicalCorrections['results.csv'], 1);
const merged = mergeGpRefresh(old, corrected, correctionAssessment);
assert.equal(merged['results.csv'].split('\n')[1], old['results.csv'].split('\n')[1], 'published result is preserved');
assert.equal(merged['results.csv'].split('\n').length, old['results.csv'].split('\n').length + 20, 'new race rows are appended');
assert.throws(() => assessGpRefresh(old, snapshot({ next: true, gap: true }), new Date('2026-10-26')), /skipped/);
assert.throws(() => assessGpRefresh(old, snapshot({ next: true }), new Date('2026-10-17')), /future/);
console.log('PASS GP refresh: no-op until a new race, preserves history, rejects incomplete weekends, gaps and future dates');
