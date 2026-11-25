import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { prepareUnifiedForecast } from '../packages/core/src/unified/forecast.js';
import { predictGrid } from '../site/js/prediction.js';

const { model } = deserialize(await readFile('data/model.json', 'utf8'));
const drivers = model.snaps.at(-1).drivers;
const date = model.snaps.at(-1).date;
const options = { date, laps: 60 };
const rows = predictGrid(model, options);
assert.equal(rows.length, drivers.length);
assert.ok(Math.abs(rows.reduce((total, row) => total + row.expectedPosition, 0) - (drivers.length * (drivers.length + 1)) / 2) < 1e-8);
const forecast = prepareUnifiedForecast(model, { date });
const first = drivers[0];
const expected = 1 + drivers.slice(1).reduce((sum, opponent) => sum + 1 - forecast(first.driverId, opponent.driverId, { L: 60 }).p, 0);
assert.ok(Math.abs(rows.find((row) => row.driver.driverId === first.driverId).expectedPosition - expected) < 1e-9);
const grid = drivers.map((_, index) => index + 1);
assert.notDeepEqual(
  predictGrid(model, { ...options, positions: grid }).map((row) => row.expectedPosition),
  rows.map((row) => row.expectedPosition),
);
assert.throws(() => predictGrid(model, { ...options, positions: [1] }), /every driver/);
assert.throws(() => predictGrid(model, { ...options, positions: grid.map(() => 1) }), /unique/);
assert.throws(() => predictGrid(model, { ...options, positions: grid.map((value) => value + 1) }), /starting position/);
assert.throws(() => predictGrid(model, { ...options, laps: 0 }), /distance/);
assert.throws(() => predictGrid(model, { ...options, date: 'not-a-date' }), /date/);
console.log('PASS pairwise expected positions, starting-grid influence and invalid inputs');
