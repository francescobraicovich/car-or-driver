import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { forecastPreWeekend, forecastRace } from '../packages/core/src/unified/forecast.js';

const reference = JSON.parse(await readFile('tests/fixtures/unified-inference.json', 'utf8'));
const grid = JSON.parse(await readFile('tests/fixtures/unified-grid-inference.json', 'utf8'));
const model = reference.model;
model.forecastState.gridHeads = grid.heads;
const close = (actual, expected, tolerance = 3e-5) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

for (const fixture of grid.fixtures) {
  const actual = forecastRace(model, fixture.a, fixture.b, fixture);
  const reversed = forecastRace(model, fixture.b, fixture.a, { ...fixture, gridA: fixture.gridB, gridB: fixture.gridA });
  close(actual.p, fixture.p);
  close(actual.competitive, fixture.competitive);
  close(actual.p + reversed.p, 1, 1e-10);
  assert.equal(actual.forecastMode, 'grid');
  assert.equal(actual.calibrationThrough, 2025);
}

const { a, b, date } = grid.fixtures[0];
const before = JSON.stringify(model);
const original = forecastPreWeekend(model, a, b, { date });
for (const positions of [{}, { gridA: 3 }, { gridB: 8 }, { gridA: 3, gridB: 0 }, { gridA: '', gridB: 8 }, { gridA: 3, gridB: null }]) {
  assert.deepEqual(forecastRace(model, a, b, { date, ...positions }), {
    ...original,
    gridA: positions.gridA || null,
    gridB: positions.gridB || null,
  });
}
const ahead = forecastRace(model, a, b, { date, gridA: 1, gridB: 10 });
const behind = forecastRace(model, a, b, { date, gridA: 20, gridB: 10 });
assert.ok(ahead.p > behind.p, 'a better starting position increases the conditional chance');
assert.deepEqual(ahead.timing, original.timing, 'grid affects the result forecast, not portable pace');
assert.equal(ahead.gap, original.gap);
assert.equal(ahead.sd, original.sd);
for (const gridA of [-1, 41, 1.5, NaN, Infinity, 'unknown']) assert.throws(() => forecastRace(model, a, b, { gridA, gridB: 2 }), /Grid/);
assert.throws(() => forecastRace(model, a, b, { gridA: 2, gridB: 2 }), /different/);
assert.throws(() => forecastPreWeekend(model, a, b, { gridA: 1, gridB: 2 }), /forecastRace/);
assert.equal(JSON.stringify(model), before, 'conditional forecasts must never change ratings');
delete model.forecastState.gridHeads;
assert.throws(() => forecastRace(model, a, b, { gridA: 1, gridB: 2 }), /not available/);
assert.equal(forecastRace(model, a, b).forecastMode, 'pre');

const shipped = deserialize(await readFile('data/model.json', 'utf8')).model;
for (const fitted of grid.heads) {
  const saved = shipped.forecastState.gridHeads.find((head) => head.fromYear === fitted.fromYear);
  assert.equal(saved.trainedThrough, fitted.fromYear - 1);
  for (const key of ['ratingCoefficient', 'gridCoefficient', 'penalty', 'innerScore']) close(saved[key], fitted[key], 1e-8);
}
assert.ok(shipped.forecastState.gridHeads.every((head) => head.trainedThrough < head.fromYear));
console.log(
  `PASS unified grid: ${grid.fixtures.length} Python fixtures, reversal, exact missing-grid fallback, invalid inputs and unchanged ratings`,
);
