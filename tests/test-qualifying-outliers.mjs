import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { csv } from '../packages/core/src/csv.js';
import { FormFeatures } from '../packages/core/src/forecast/form.js';
import {
  buildQualObservations,
  censoredQ1Outliers,
  censoredQualifyingIds,
  censoredQualifyingSegments,
  qualifyingTreatment,
} from '../packages/core/src/qualifying.js';

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
  ['247', '63'], // Salo: only a wet Saturday time against dry Friday laps
  ['255', '87'], // Blundell: 16-minute incomplete lap
  ['113', '4'], // Alonso: one-lap qualifying mistake
  ['121', '4'], // Alonso: electrical failure on the qualifying lap
]) {
  const rows = qualifying.filter((q) => q.raceId === raceId);
  assert.ok(censoredQualifyingIds(rows).has(driverId), `severe single-session anomaly ${raceId}/${driverId}`);
}
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
for (const [raceId, driverId, year, expected] of [
  ['1162', '848', 2025, 'Q2'],
  ['1172', '865', 2026, 'Q3'],
]) {
  const rows = qualifying.filter((q) => q.raceId === raceId);
  const row = rows.find((q) => q.driverId === driverId);
  assert.equal(qualifyingTreatment(row, year, rows).deep, expected, 'a missing Q1 record does not erase later valid laps');
}
for (const [raceId, driverId, segment, previous] of [
  ['882', '18', 'q3', 'q2'], // Button: deliberate slow Q3 lap for tyre choice
  ['1107', '815', 'q2', 'q1'], // Pérez: only his in-lap survived track-limit deletions
]) {
  const rows = qualifying.filter((q) => q.raceId === raceId);
  assert.ok(censoredQualifyingSegments(rows).get(segment)?.has(driverId));
  const obs = buildQualObservations(rows).filter((one) => one.x.driverId === driverId || one.y.driverId === driverId);
  assert.ok(obs.length > 0 && obs.every((one) => one.seg !== segment), `bad ${segment} time falls back to earlier valid session`);
  assert.ok(obs.some((one) => one.seg === previous));
  assert.match(
    qualifyingTreatment(
      rows.find((row) => row.driverId === driverId),
      +raceId === 882 ? 2013 : 2023,
      rows,
    ).treatment,
    /earlier/,
  );
}
const tied = [
  { raceId: 'test', driverId: 'a', constructorId: 'x', q1: '1:20.000', q2: '\\N', q3: '\\N' },
  { raceId: 'test', driverId: 'b', constructorId: 'y', q1: '1:20.000', q2: '\\N', q3: '\\N' },
];
assert.deepEqual(buildQualObservations(tied), [], 'equal recorded times are a tie, not an arbitrary loss');
for (const [raceId, first, second, segment] of [
  ['932', '20', '8', 'q1'], // Vettel's interrupted Q1
  ['1107', '815', '830', 'q2'], // Pérez's deleted Q2 laps
]) {
  const qrows = qualifying.filter((row) => row.raceId === raceId);
  const rows = [first, second].map((driverId) => ({
    driverId,
    constructorId: qrows.find((row) => row.driverId === driverId).constructorId,
    grid: 1,
  }));
  const form = new FormFeatures(null);
  form.beforeWeekend({
    info: { year: 2023, round: 1, circuitId: 'test' },
    rows,
    qrows,
    D: new Map(),
    C: new Map(),
    QD: new Map(),
    QC: new Map(),
    raceSeen: new Map(),
  });
  const features = form.features(rows[0], rows[1], 'race', 0.5, 0.5);
  assert.equal(features[`missing_${segment}`], 1, `censored ${segment} is absent from the forecast too`);
}
const model = JSON.parse(await readFile('data/model.json', 'utf8'));
const may = model.model.snaps.find((snap) => snap.year === 2016 && snap.round === 5);
const monacoRating = model.model.snaps.find((snap) => snap.year === 2016 && snap.round === 6);
const maxRating = (snap) => snap.drivers.find((driver) => driver.driverId === '830').combined;
assert.ok(maxRating(may) - maxRating(monacoRating) < 10, 'a crashed Q1 no longer causes a 30-point driver-rating collapse');
console.log('PASS extreme isolated Q1 laps are censored, ordinary laps are retained');
