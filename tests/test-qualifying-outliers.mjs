import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { csv } from '../packages/core/src/csv.js';
import { buildQualObservations, censoredQ1Outliers, censoredQualifyingIds, qualifyingTreatment } from '../packages/core/src/qualifying.js';

const qualifying = csv(await readFile('data/qualifying.csv', 'utf8'));
const monaco = qualifying.filter((q) => q.raceId === '953');
assert.ok(censoredQ1Outliers(monaco).has('830'), 'Max’s interrupted Monaco Q1 is an extreme outlier');
assert.ok(!buildQualObservations(monaco).some((o) => o.x.driverId === '830' || o.y.driverId === '830'));
assert.match(
  qualifyingTreatment(
    monaco.find((q) => q.driverId === '830'),
    2016,
    monaco,
  ).treatment,
  /censored/,
);
const ordinary = monaco.map((q) => (q.driverId === '830' ? { ...q, q1: '1:17.000' } : q));
assert.ok(!censoredQ1Outliers(ordinary).has('830'), 'an ordinary slow Q1 remains evidence');
assert.ok(buildQualObservations(ordinary).some((o) => o.x.driverId === '830' || o.y.driverId === '830'));
const teammateMissing = monaco.filter((q) => q.driverId !== '817');
assert.ok(!censoredQ1Outliers(teammateMissing).has('830'), 'the rule requires a timed teammate');
for (const [raceId, driverId] of [
  ['932', '20'], // Vettel: MGU-H failure
  ['1052', '20'], // Vettel: yellow flags
  ['1099', '846'], // Norris: wall contact
]) {
  const rows = qualifying.filter((q) => q.raceId === raceId);
  assert.ok(censoredQualifyingIds(rows).has(driverId), `documented interrupted Q1 ${raceId}/${driverId}`);
  assert.ok(!buildQualObservations(rows).some((o) => o.x.driverId === driverId || o.y.driverId === driverId));
}
const jeddah = qualifying.filter((q) => q.raceId === '1075');
assert.ok(!censoredQualifyingIds(jeddah).has('1'), 'a genuinely slow Hamilton Q1 is retained');
const tied = [
  { raceId: 'test', driverId: 'a', constructorId: 'x', q1: '1:20.000', q2: '\\N', q3: '\\N' },
  { raceId: 'test', driverId: 'b', constructorId: 'y', q1: '1:20.000', q2: '\\N', q3: '\\N' },
];
assert.deepEqual(buildQualObservations(tied), [], 'equal recorded times are a tie, not an arbitrary loss');
const model = JSON.parse(await readFile('data/model.json', 'utf8'));
const may = model.model.snaps.find((snap) => snap.year === 2016 && snap.round === 5);
const monacoRating = model.model.snaps.find((snap) => snap.year === 2016 && snap.round === 6);
const maxRating = (snap) => snap.drivers.find((driver) => driver.driverId === '830').combined;
assert.ok(maxRating(may) - maxRating(monacoRating) < 10, 'a crashed Q1 no longer causes a 30-point driver-rating collapse');
console.log('PASS extreme isolated Q1 laps are censored, ordinary laps are retained');
