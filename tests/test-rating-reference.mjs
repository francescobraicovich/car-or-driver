import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { withHistories } from '../packages/core/src/weekend-histories.js';
import { prepareUnifiedForecast } from '../packages/core/src/unified/forecast.js';
import { scenarioForecast } from '../packages/core/src/unified/scenario.js';
import { buildRatingReference, centredRatings, REFERENCE_FIELD_SIZE, REFERENCE_HALF_LIFE } from '../site/js/rating-reference.js';
import { withAnnualUncertainty } from '../site/js/retrospective-uncertainty.js';
import { ratingRows } from '../site/js/ratings-view.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const row = (value, id = '1') => ({ driverId: id, constructorId: id, name: id, qual: value, race: value + 20, overall: value - 10 });
const fixture = {
  snaps: Array.from({ length: 23 }, (_, index) => ({
    raceId: index,
    year: index < 10 ? 2000 : 2001,
    round: index + 1,
    drivers: [row(index ? 1020 : 1000)],
    cars: [row(index ? 1080 : 1040)],
  })),
};
const reference = buildRatingReference(fixture, 'fixture');
assert.equal(REFERENCE_HALF_LIFE, 20);
assert.deepEqual(REFERENCE_FIELD_SIZE, { drivers: 20, cars: 10 });
for (const [kind, origin, change] of [
  ['drivers', 1000, 20],
  ['cars', 1040, 40],
]) {
  close(reference.snapshots[1][kind].qual, origin); // current observations do not move the reference
  close(reference.snapshots[21][kind].qual, origin + change / 2); // exactly 20 updates; no winter reset
  close(reference.snapshots[21][kind].race, origin + change / 2 + 20);
  close(reference.snapshots[21][kind].overall, origin + change / 2 - 10);
}
const altered = structuredClone(fixture);
altered.snaps[10].drivers.push(row(500, 'newcomer'));
altered.snaps[10].cars.push(row(500, 'newcar'));
const alteredReference = buildRatingReference(altered, 'fixture');
assert.deepEqual(alteredReference.snapshots.slice(0, 11), reference.snapshots.slice(0, 11), 'lineup changes have no immediate effect');
assert.notDeepEqual(alteredReference.snapshots[11], reference.snapshots[11], 'the following weekend incorporates the new field slowly');
const prefix = buildRatingReference({ snaps: fixture.snaps.slice(0, 10) }, 'fixture');
assert.deepEqual(prefix.snapshots, reference.snapshots.slice(0, 10), 'future weekends do not revise history');
// The reference field is the 20 highest-rated drivers and the 10 highest-rated cars, ranked separately for each output.
const field = (prefix, count, start, step) => Array.from({ length: count }, (_, index) => row(start + step * index, `${prefix}${index}`));
const fullGrid = { snaps: [{ raceId: 0, drivers: field('d', 20, 1000, 2), cars: field('c', 10, 1000, 4) }] };
const largeGrid = structuredClone(fullGrid);
largeGrid.snaps[0].drivers.push(...field('backmarker', 8, 900, 1));
largeGrid.snaps[0].cars.push(...field('backmarker', 4, 900, 1));
const fullGridReference = buildRatingReference(fullGrid, 'fixture').snapshots[0];
assert.deepEqual(
  buildRatingReference(largeGrid, 'fixture').snapshots[0],
  fullGridReference,
  'entrants below the reference field do not move it',
);
close(fullGridReference.drivers.qual, 1019);
close(fullGridReference.drivers.race, 1039);
close(fullGridReference.drivers.overall, 1009);
close(fullGridReference.cars.qual, 1018);
const smallGrid = {
  snaps: [{ raceId: 0, drivers: [row(1000, 'a'), row(1010, 'b'), row(1050, 'c')], cars: [row(1000, 'a'), row(1100, 'b')] }],
};
const smallGridReference = buildRatingReference(smallGrid, 'fixture').snapshots[0];
close(smallGridReference.drivers.qual, 1010); // a median, not the mean of 1,020
close(smallGridReference.cars.qual, 1050);
const displayedFixture = centredRatings(fixture, reference, 'fixture');
close(displayedFixture.snaps[0].drivers[0].qual, 1000);
close(displayedFixture.snaps[1].drivers[0].qual, 1020); // no forced field mean
assert.throws(() => centredRatings(fixture, reference, 'wrong'), /match/);
assert.throws(() => centredRatings(fixture, { ...reference, halfLife: 10 }, 'fixture'), /match/);
assert.throws(() => centredRatings(fixture, { ...reference, format: 1 }, 'fixture'), /match/);
assert.throws(() => centredRatings(fixture, { ...reference, fieldSize: { drivers: 22, cars: 10 } }, 'fixture'), /match/);
assert.throws(() => centredRatings(fixture, { ...reference, snapshots: [] }, 'fixture'), /Missing/);

// The site centres the historical ratings, whose latest weekend is the filtered one; forecasts read the filtered model.
const filtered = deserialize(await readFile('data/model.json', 'utf8'));
const retrospective = deserialize(await readFile('data/retrospective.json', 'utf8'));
const referenceFile = JSON.parse(await readFile('data/rating-reference.json', 'utf8'));
assert.deepEqual(
  referenceFile,
  { ...buildRatingReference(retrospective.model, retrospective.refitHash), licence: retrospective.licence },
  'saved reference is current',
);
const model = withHistories(filtered.model);
const historicalModel = withAnnualUncertainty(retrospective.model);
const historical = withHistories(historicalModel);
const original = structuredClone(model);
const originalHistorical = structuredClone(historical);
const latest = model.snaps.at(-1);
const predictions = (raw) => {
  const forecast = prepareUnifiedForecast(raw);
  return latest.drivers.flatMap((a, index) =>
    latest.drivers.slice(index + 1).map((b) => ({
      beforeWeekend: forecast(a.driverId, b.driverId),
      withGrid: forecast(a.driverId, b.driverId, { gridA: 1, gridB: 5 }),
    })),
  );
};
const scenarios = (raw) => {
  const [a, b] = latest.drivers;
  return ['latest', 'prime', 'date'].map((kind) =>
    scenarioForecast(
      raw,
      { driverId: a.driverId, when: kind === 'date' ? { kind, date: raw.dh.get(a.driverId)[0].date } : { kind } },
      { driverId: b.driverId, when: { kind: 'latest' } },
    ),
  );
};
const forecastsBefore = predictions(model);
const scenariosBefore = scenarios(historical);
const displayed = centredRatings(historicalModel, referenceFile, retrospective.refitHash);
assert.ok(!displayed.forecastState, 'display rows do not carry a forecast state');
assert.deepEqual(model, original, 'projection does not mutate any model value');
assert.deepEqual(historical, originalHistorical, 'projection does not mutate any historical value');
assert.deepEqual(
  predictions(model),
  forecastsBefore,
  'all current forecasts, timing intervals and known-grid forecasts are exactly unchanged',
);
assert.deepEqual(scenarios(historical), scenariosBefore, 'latest, peak and mixed-date scenarios are exactly unchanged');

let pairs = 0;
let maximumGapDifference = 0;
for (const [index, snapshot] of historical.snaps.entries())
  for (const kind of ['drivers', 'cars']) {
    const rows = displayed.snaps[index][kind];
    for (const [position, raw] of snapshot[kind].entries()) {
      for (const [key, value] of Object.entries(raw))
        if (!['qual', 'race', 'overall', 'combined'].includes(key))
          assert.deepEqual(rows[position][key], value, `${kind}.${key} unchanged`);
      assert.equal(rows[position].combined, rows[position].overall);
      for (let other = 0; other < position; other++)
        for (const output of ['qual', 'race', 'overall']) {
          const difference = Math.abs(rows[position][output] - rows[other][output] - (raw[output] - snapshot[kind][other][output]));
          maximumGapDifference = Math.max(maximumGapDifference, difference);
          assert.ok(difference < 1e-9);
          pairs++;
        }
    }
  }

const latestFile = deserialize(await readFile('data/retrospective-latest.json', 'utf8'));
const firstScreen = centredRatings(latestFile.model, referenceFile, latestFile.refitHash);
for (const [type, history, kind] of [
  ['driver', 'dh', 'drivers'],
  ['car', 'ch', 'cars'],
]) {
  assert.deepEqual(firstScreen.snaps[0][kind], displayed.snaps.at(-1)[kind]);
  for (const output of ['qual', 'race', 'overall']) {
    const earlyRows = ratingRows(firstScreen, 0, type, output);
    const fullRows = ratingRows(displayed, displayed.snaps.length - 1, type, output);
    for (const [index, early] of earlyRows.entries()) {
      const full = fullRows[index];
      assert.equal(early.id, full.id);
      assert.equal(early.value, full.value);
      assert.equal(early.change, full.change, 'no value or change flash when full history loads');
    }
  }
  for (const [id, points] of displayed[history]) {
    const rawPoints = historical[history].get(id);
    for (const [index, point] of points.entries()) {
      const datedReference = referenceFile.snapshots.find((snapshot) => String(snapshot.raceId) === String(point.raceId));
      close(point.overall, 1000 + rawPoints[index].overall - datedReference[kind].overall);
    }
  }
}
// Return after an absence: changes compare the two actual appearance dates, not adjacent field references.
const returning = structuredClone(fixture);
returning.snaps[1].drivers = [row(1500, '2')];
const returningReference = buildRatingReference(returning, 'fixture');
const returningDisplay = centredRatings(returning, returningReference, 'fixture');
close(
  ratingRows(returningDisplay, 2, 'driver', 'overall')[0].change,
  returningDisplay.snaps[2].drivers[0].overall - returningDisplay.snaps[0].drivers[0].overall,
);

console.log(
  JSON.stringify(
    {
      result: 'PASS',
      refitHash: retrospective.refitHash,
      halfLife: REFERENCE_HALF_LIFE,
      fieldSize: REFERENCE_FIELD_SIZE,
      weekends: historical.snaps.length,
      channelPairGapsChecked: pairs,
      maximumGapDifference,
      currentPairsWithUnchangedForecasts: forecastsBefore.length,
      knownGridPairsWithUnchangedForecasts: forecastsBefore.length,
      unchangedScenarioModes: ['latest', 'prime', 'mixed-date'],
      underlyingModelUnchanged: true,
      firstScreenMatchesFullHistory: true,
      latestOverallMeans: Object.fromEntries(
        ['drivers', 'cars'].map((kind) => [
          kind,
          displayed.snaps.at(-1)[kind].reduce((sum, row) => sum + row.overall, 0) / displayed.snaps.at(-1)[kind].length,
        ]),
      ),
    },
    null,
    2,
  ),
);
