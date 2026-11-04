import assert from 'node:assert/strict';
import { createHazards } from '../packages/core/src/hazard.js';
import { buildRaceObservations } from '../packages/core/src/observations.js';
import { defaultClass } from '../packages/core/src/status.js';
import { buildQualObservations } from '../packages/core/src/qualifying.js';
import { prepareWeekends } from '../packages/core/src/weekends.js';

const raw = (results, qualifying = [], constructorIds = ['x']) => ({
  drivers: [{ driverId: 'a' }, { driverId: 'b' }],
  constructors: constructorIds.map((constructorId) => ({ constructorId })),
  status: [{ statusId: '1', status: 'Finished' }],
  races: [{ raceId: '1', year: '2024', round: '1', name: 'Test', date: '2024-03-01' }],
  results,
  qualifying,
});

const result = (driverId, positionOrder, resultId) => ({
  resultId: String(resultId),
  raceId: '1',
  driverId,
  constructorId: 'x',
  position: String(positionOrder),
  positionOrder: String(positionOrder),
  laps: '50',
  grid: String(positionOrder),
  statusId: '1',
});

const qualifyingRow = (driverId, position, q1) => ({
  qualifyingId: `${driverId}-${position}`,
  raceId: '1',
  driverId,
  constructorId: 'x',
  position: String(position),
  q1,
  q2: '\\N',
  q3: '\\N',
});

// Missing and malformed session times are absent evidence, while a valid shared segment remains usable.
{
  const rows = [
    { driverId: 'a', constructorId: 'x', position: '1', q1: null, q2: '1:20.000', q3: '' },
    { driverId: 'b', constructorId: 'x', position: '2', q1: '\\N', q2: '1:21.000', q3: undefined },
    { driverId: 'c', constructorId: 'x', position: '3', q1: 'invalid', q2: null, q3: '\\N' },
  ];
  const observations = buildQualObservations(rows);
  assert.equal(observations.length, 1, 'only the pair with a shared valid timed segment produces evidence');
  assert.equal(observations[0].seg, 'q2', 'later valid evidence survives missing Q1 times');
  assert.equal(observations[0].obs, 1, 'the faster valid Q2 lap wins');
}

// Exact repeated result and qualifying rows are removed before pairwise evidence is built.
{
  const first = result('a', 1, 1);
  const duplicate = { ...first };
  const resultRows = [first, duplicate, result('b', 2, 2)];
  const qa = qualifyingRow('a', 1, '1:20.000');
  const qb = qualifyingRow('b', 2, '1:21.000');
  const qualifyingRows = [qa, { ...qa }, qb];
  const prepared = prepareWeekends(raw(resultRows, qualifyingRows)).weekends[0];
  assert.equal(prepared.rows.length, 2, 'exact duplicate result rows are removed');
  assert.equal(prepared.qrows.length, 2, 'exact duplicate qualifying rows are removed');
  const built = buildRaceObservations({
    rid: prepared.rid,
    rows: prepared.rows,
    maxLaps: prepared.maxLaps,
    lapPace: null,
    lapSnapshots: new Map(),
    orderW: 1,
    paceW: 1,
    beta: 1,
  });
  assert.equal(built.observations.length, 1, 'an exact duplicate result row does not duplicate the driver comparison');
  assert.equal(
    buildQualObservations(prepared.qrows).length,
    1,
    'an exact duplicate qualifying row does not duplicate the timed comparison',
  );

  const permuted = prepareWeekends(raw([resultRows[2], duplicate, first], [qb, qualifyingRows[2], qa])).weekends[0];
  assert.deepEqual(permuted.rows, prepared.rows, 'result ordering does not change exact-row deduplication');
  assert.deepEqual(permuted.qrows, prepared.qrows, 'qualifying ordering does not change exact-row deduplication');
}

// Same driver and race does not imply a duplicate: distinct source records are retained.
{
  const first = result('a', 1, 1);
  const separateEntry = { ...first, resultId: '3', constructorId: 'y' };
  const prepared = prepareWeekends(raw([first, separateEntry, result('b', 2, 2)], [], ['x', 'y'])).weekends[0];
  assert.equal(
    prepared.rows.filter((row) => row.driverId === 'a').length,
    2,
    'distinct historical entries for one driver remain available',
  );
}

// A mechanical status updates car reliability without inventing a pace loss; representative shared laps remain usable.
{
  const retiree = { driverId: 'a', constructorId: 'x', statusId: 'engine', statusName: 'Engine', positionOrder: '2', laps: '30' };
  const finisher = { driverId: 'b', constructorId: 'x', statusId: 'finished', statusName: 'Finished', positionOrder: '1', laps: '50' };
  const rows = [retiree, finisher];
  const withoutPace = buildRaceObservations({
    rid: '1',
    rows,
    maxLaps: 50,
    lapPace: null,
    lapSnapshots: new Map(),
    orderW: 1,
    paceW: 1,
    beta: 1,
  });
  assert.equal(withoutPace.observations.length, 0, 'one finisher and a mechanical retirement do not create a pace pair');

  const hazards = createHazards({ relHalf: 100, relPrior: 1000, relWinter: 0.5, incHalf: 100, incPrior: 1000 });
  hazards.enter(rows);
  hazards.before(rows);
  const event = hazards.record(rows, (statusId) => defaultClass(statusId === 'engine' ? 'Engine' : 'Finished'));
  assert.equal(event.mechEventWeight, 1, 'the mechanical failure contributes to reliability');
  assert.equal(event.driverEventWeight, 0, 'the mechanical failure does not become a driver incident');
  assert.equal(hazards.rel.get('x').f, 1);
  assert.equal(hazards.inc.get('a').f, 0);

  const window = (median) => ({
    med: median,
    n: 8,
    win: [
      { s: 2, med: median, n: 4 },
      { s: 10, med: median, n: 4 },
    ],
  });
  const lapPace = new Map([
    [
      '1',
      new Map([
        ['a', window(81)],
        ['b', window(80)],
      ]),
    ],
  ]);
  const withPace = buildRaceObservations({
    rid: '1',
    rows,
    maxLaps: 50,
    lapPace,
    lapSnapshots: new Map(),
    orderW: 0,
    paceW: 1,
    beta: 1,
  });
  assert.equal(withPace.observations.length, 1);
  assert.equal(withPace.observations[0].source, 'paceW', 'valid shared laps remain pace evidence after a mechanical retirement');
  assert.equal(withPace.observations[0].obs, 0, 'the slower clean lap evidence points in the slower direction');
}

console.log('PASS evidence integrity: missing qualifying times, duplicate rows, and retirement evidence');
