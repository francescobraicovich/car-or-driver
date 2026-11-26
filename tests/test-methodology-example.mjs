// The worked weekend of the full methodology (Section 6: the 2026 Las Vegas Grand Prix, Ferrari), and its short form in the simple methodology
// (part 4), quote numbers from the chronological run. The best guesses do not move between weekends, so the strengths before Las Vegas are those
// after the previous weekend; the forecast adds the two weeks of driver drift to the published covariance of that weekend. A model change that
// alters these numbers fails here until the text is updated with it.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { CONTENT_HTML } from '../site/js/methodology-content.js';
import { SIMPLE_CONTENT_HTML } from '../site/js/methodology-simple-content.js';

const POINTS = 75 / Math.LN10;
const DRIVER_STEP_POINTS = 8; // per square-root year: 4 points times the driver multiplier of 2 (packages/core/python/unified_model.py)
const model = deserialize(await readFile('data/model.json', 'utf8')).model;
assert.equal(model.params.parameters.driver_multiplier, 2, 'the driver step in the text assumes a multiplier of 2');

const index = model.snaps.findIndex((snap) => snap.year === 2026 && snap.name === 'Las Vegas Grand Prix');
assert.ok(index > 0, 'the 2026 Las Vegas Grand Prix is in the model');
const [before, after] = [model.snaps[index - 1], model.snaps[index]];
const driver = (snap, id) => snap.drivers.find((row) => row.driverId === id);
const car = (snap, id) => snap.cars.find((row) => row.carId === id);
const HAMILTON = '1';
const LECLERC = '844';
const FERRARI = '6';

const rows = [
  ['Hamilton', driver(before, HAMILTON).overall, driver(after, HAMILTON).overall, '1030.8', '1031.8'],
  ['Leclerc', driver(before, LECLERC).overall, driver(after, LECLERC).overall, '1046.4', '1044.7'],
  ['Ferrari', car(before, FERRARI).overall, car(after, FERRARI).overall, '1134.8', '1124.8'],
];
for (const [name, start, end, quotedStart, quotedEnd] of rows) {
  assert.equal(start.toFixed(1), quotedStart, `${name} before the weekend`);
  assert.equal(end.toFixed(1), quotedEnd, `${name} after the weekend`);
  assert.ok(CONTENT_HTML.includes(`<td>${quotedStart}</td><td>${quotedEnd}</td>`), `the table quotes ${name}`);
}
const gapBefore = driver(before, LECLERC).overall - driver(before, HAMILTON).overall;
const gapAfter = driver(after, LECLERC).overall - driver(after, HAMILTON).overall;
assert.ok(
  CONTENT_HTML.includes(`narrowed from ${gapBefore.toFixed(1)} to ${gapAfter.toFixed(1)} points`),
  'the text quotes the teammate gap',
);

// Step 2: Hamilton's chance of finishing ahead if both finish, before calibration.
const { keys, covariance } = before.unified;
const position = (id) => keys.findIndex(([kind, identity]) => kind === 'driver' && identity === id);
const [h, l] = [position(HAMILTON), position(LECLERC)];
assert.ok(h >= 0 && l >= 0, 'both Ferrari drivers raced the previous weekend');
const years = (Date.parse(after.date) - Date.parse(before.date)) / (365.25 * 86400000);
const drift = (DRIVER_STEP_POINTS / POINTS) ** 2 * years;
const variance = covariance[h][h] + covariance[l][l] - 2 * covariance[h][l] + 2 * drift;
const mean = -gapBefore / POINTS;
const chance = 1 / (1 + Math.exp(-mean / Math.sqrt(1 + (Math.PI * variance) / 8)));
assert.equal(Math.round(100 * chance), 39, `Hamilton's chance before calibration is ${chance}`);
assert.ok(CONTENT_HTML.includes('gave Hamilton a 39% chance'), 'the text quotes the forecast');

// The simple methodology: the car fell by 10 points while each driver moved by less than 2.
const carChange = car(after, FERRARI).overall - car(before, FERRARI).overall;
assert.equal(Math.round(carChange), -10, 'the Ferrari car fell by 10 points');
for (const id of [HAMILTON, LECLERC])
  assert.ok(Math.abs(driver(after, id).overall - driver(before, id).overall) < 2, `driver ${id} moved by less than 2 points`);
assert.ok(
  SIMPLE_CONTENT_HTML.includes('lowered the Ferrari car by 10 points, while each driver moved by less than 2 points'),
  'the simple methodology quotes the Ferrari weekend',
);

console.log('PASS methodology example: the 2026 Las Vegas weekend matches the published chronological run, in both methodologies');
