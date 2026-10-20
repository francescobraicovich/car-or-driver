// The ratings the site downloads (data/model.json, data/export-rows.json) must be current, and must show a visitor what a fresh build of the model shows.
//   1. The fingerprint in the file matches the data and the model source now (otherwise: node tools/build-model.mjs).
//   2. The serializer keeps integers, strings, Maps, Sets and non-finite numbers exactly, and other numbers to better than 1e-8.
//   3. Against a fresh build, to a relative tolerance of 1e-5: every weekend's ratings and error bars, every history, the circuit and wet-weather
//      skills, the figures the Methodology prints, and the Head to head forecasts (grid, circuit, wet, and a constructed matchup).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadData } from '../packages/research/node/common.mjs';
import { buildStateSpace } from '../packages/core/src/state-space/build.js';
import { eloBenchmark } from '../packages/core/src/elo-benchmark.js';
import { deserialize, serialize } from '../packages/core/src/json-serialization.js';
import { summarizeBacktest } from '../packages/core/src/backtest.js';
import { forecastH2H, forecastPreWeekend } from '../packages/core/src/forecast/head-to-head.js';
import { ratingsAlone } from '../packages/core/src/state-space/forecast.js';
import { scenarioForecast } from '../packages/core/src/forecast/scenario.js';
import { withHistories } from '../packages/core/src/weekend-histories.js';
import { FILE_FORMAT, driverProfiles, trimmedModel } from '../tools/build-model.mjs';
import { modelSourceHash } from '../tools/model-source-hash.mjs';

// 2. the serializer
const sample = {
  integer: 123456789012,
  fraction: Math.PI,
  text: 'a',
  nothing: null,
  missing: undefined,
  numbers: [NaN, Infinity, -Infinity, 0],
  map: new Map([[1, new Set(['x'])]]),
  typed: Float64Array.from([1.5, NaN]),
};
const copy = deserialize(serialize(sample));
assert.equal(copy.integer, sample.integer, 'integers are exact, even above 1e9');
assert.ok(Math.abs(copy.fraction - Math.PI) / Math.PI < 1e-8);
assert.ok(Number.isNaN(copy.numbers[0]) && copy.numbers[1] === Infinity && copy.numbers[2] === -Infinity);
assert.ok('missing' in copy && copy.missing === undefined && copy.nothing === null);
assert.deepEqual([...copy.map.get(1)], ['x']);
assert.ok(copy.typed instanceof Float64Array && Number.isNaN(copy.typed[1]));
assert.throws(() => serialize({ f() {} }), TypeError);
assert.throws(() => serialize({ $: 1 }), TypeError);

// 1. the committed files
const { sourceHash, lastRace } = await modelSourceHash();
const file = deserialize(await readFile('data/model.json', 'utf8'));
const exportFile = deserialize(await readFile('data/export-rows.json', 'utf8'));
assert.equal(file.format, FILE_FORMAT);
for (const [name, f] of [
  ['model.json', file],
  ['export-rows.json', exportFile],
])
  assert.equal(f.sourceHash, sourceHash, `data/${name} was built from other data or other model code: run node tools/build-model.mjs`);
assert.deepEqual(file.lastRace, lastRace);
const latestFile = deserialize(await readFile('data/model-latest.json', 'utf8'));
assert.equal(latestFile.sourceHash, sourceHash, 'data/model-latest.json is out of date: run node tools/build-model.mjs');
const lastWeekend = file.model.snaps.at(-1);
assert.deepEqual(
  latestFile.model.snaps,
  [{ ...lastWeekend, diag: undefined, ssDiag: undefined }].map(({ diag, ssDiag, ...rest }) => rest), // eslint-disable-line no-unused-vars
  'the first-screen file carries the latest weekend of the full file',
);
assert.equal(latestFile.model.dh.size, lastWeekend.drivers.length, 'and one earlier row for each driver on it');
const shipped = withHistories(file.model); // as the site has it: the histories rebuilt from the weekends
assert.ok(!('dh' in file.model) && !('ch' in file.model), 'the file does not carry the histories');

// 3. a fresh build, with the benchmark, exactly as the site built it before the file existed
const data = await loadData();
// the card on a row of the ratings: names and birth dates of the drivers rated, from drivers.csv (the first screen's file has those on the latest weekend)
const ratedIn = (snaps) => snaps.flatMap((snap) => snap.drivers.map((row) => row.driverId));
assert.deepEqual(
  file.driverProfiles,
  driverProfiles(data.raw.drivers, ratedIn(file.model.snaps)),
  "data/model.json carries the drivers' profiles",
);
assert.deepEqual(
  latestFile.driverProfiles,
  driverProfiles(data.raw.drivers, ratedIn(file.model.snaps.slice(-1))),
  'and the first screen those on its weekend',
);
assert.ok(
  Object.values(file.driverProfiles).every(([forename, surname]) => forename && surname),
  'every driver rated has a first name and a surname',
);
assert.ok(
  Object.values(file.driverProfiles).filter(([, , born]) => born).length > 0.9 * Object.keys(file.driverProfiles).length,
  'nearly every one has a month of birth',
);
assert.ok(
  Object.values(file.driverProfiles).every(([, , born]) => born === '' || /^\d{4}-\d{2}$/.test(born)),
  'only the year and the month of birth are published, never a full date (the privacy notice says so)',
);
assert.ok(
  !/\d{4}-\d{2}-\d{2}/.test(JSON.stringify([file.driverProfiles, latestFile.driverProfiles])),
  'no full birth date is in either profile block',
);
const fresh = buildStateSpace(data.raw, data.lapSnapshots, data.maps, { modelKind: 'state-space' }, data.lapPace, {
  benchmark: eloBenchmark,
});

const TOLERANCE = 1e-5; // the forecast state is kept to 9 digits, so sums of it move by about 1e-5 points: a thousandth of the 0.01 a page can show
// The weekends' rows are kept to 4 significant digits (a rating near 1000 to the whole point, which is what the pages show), so they, the histories
// rebuilt from them and whatever is computed from them are compared to 5e-4 of their size (half a unit in the fourth digit is at most 5e-4 of a value).
const ROUNDED_TOLERANCE = 5e-4;
// A forecast is a probability shown to a whole percent (errors of about 1e-3 against the 5e-3 that would change the display) or a gap in rating points,
// which sums several ratings each rounded to the whole point, so it may differ by a point.
const forecastAllowance = (expected) => (Math.abs(expected) <= 1 ? 2e-3 : 1);
const allowance = (path, expected) =>
  /^forecasts|^methodology figures/.test(path)
    ? forecastAllowance(expected)
    : (/^model\.(snaps\[\d+\]\.(drivers|cars)|dh|ch)/.test(path) ? ROUNDED_TOLERANCE : TOLERANCE) * Math.max(1, Math.abs(expected));
let compared = 0;
function same(expected, actual, path) {
  if (expected instanceof Map) {
    assert.ok(actual instanceof Map && actual.size === expected.size, `${path}: map size`);
    for (const [key, value] of expected) same(value, actual.get(key), `${path}<${key}>`);
  } else if (Array.isArray(expected) || ArrayBuffer.isView(expected)) {
    assert.ok(actual?.constructor === expected.constructor && actual.length === expected.length, `${path}: type or length`);
    expected.forEach((value, i) => same(value, actual[i], `${path}[${i}]`));
  } else if (typeof expected === 'number' && Number.isFinite(expected) && !Number.isInteger(expected)) {
    compared++;
    assert.ok(Math.abs(actual - expected) <= allowance(path, expected), `${path}: ${expected} against ${actual}`);
  } else if (expected && typeof expected === 'object' && !ArrayBuffer.isView(expected)) {
    // A forecast quotes the rows it was made from, benchmark ratings included; the file leaves those out (checked separately below).
    const keysOf = (object) => Object.keys(object).filter((key) => !/^elo[A-Z]/.test(key));
    assert.deepEqual(keysOf(actual).sort(), keysOf(expected).sort(), `${path}: keys`);
    for (const key of keysOf(expected)) same(expected[key], actual[key], `${path}.${key}`);
  } else assert.deepEqual(actual, expected, path);
}
same(trimmedModel(fresh), shipped, 'model');
assert.ok(compared > 100000, 'the comparison covered the whole model');
same(fresh.exportRows, exportFile.rows, 'exportRows');
for (const snap of shipped.snaps)
  assert.ok(!('audit' in snap) && !('eloDiag' in snap) && !('eloRace' in snap.drivers[0]), 'trimmed fields are absent');
assert.ok(
  shipped.wetFinal instanceof Map && shipped.affFinal instanceof Map && shipped.wetFinal.size > 0,
  'circuit and wet-weather skills are kept',
);

// what a page computes from the model
const figures = (model) => ({
  recent: summarizeBacktest(model, { burnIn: 20, fromYear: 2016, diag: 'ssDiag' }).overall,
  seasons: summarizeBacktest(model, { burnIn: 20, fromYear: 2008 }).seasons,
});
same(figures(fresh), figures(shipped), 'methodology figures');
const [a, b, c] = shipped.snaps
  .at(-1)
  .drivers.slice(0, 3)
  .map((d) => d.driverId);
const circuitId = shipped.snaps.at(-1).circuitId;
// A forecast carries the latest weekend it started from; no page reads its audit tables, which the file leaves out.
const withoutSnapTables = (result) => (result?.snap ? { ...result, snap: { year: result.snap.year, name: result.snap.name } } : result);
const forecasts = (model) =>
  [
    forecastH2H(model, a, b, 60, { gridA: 1, gridB: 8 }),
    forecastPreWeekend(model, a, c, { L: 60, circuitId }),
    ratingsAlone(model, b, c),
    scenarioForecast(
      model,
      { driverId: a, when: { kind: 'latest' } },
      { driverId: b, when: { kind: 'prime' } },
      { wet: true, circuitId, L: 60 },
    ),
  ].map(withoutSnapTables);
same(forecasts(fresh), forecasts(shipped), 'forecasts');
console.log(
  `PASS model file: current (source ${sourceHash}), and equal to a fresh build in ${compared} numbers, the Methodology figures and the Head to head forecasts`,
);
