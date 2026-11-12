import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { retrospectiveSourceHash } from '../tools/build-retrospective.mjs';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { withHistories } from '../packages/core/src/weekend-histories.js';
import { forecastPreWeekend } from '../packages/core/src/unified/forecast.js';
import { scenarioForecast } from '../packages/core/src/unified/scenario.js';
import { centredRatings } from '../site/js/rating-reference.js';
import { withAnnualUncertainty } from '../site/js/retrospective-uncertainty.js';

const filtered = deserialize(await readFile('data/model.json', 'utf8'));
const publishedText = await readFile('data/retrospective.json', 'utf8');
assert.ok(Buffer.byteLength(publishedText) <= 25 * 1024 * 1024, 'retrospective asset fits Cloudflare Pages');
const published = deserialize(publishedText);
const latest = deserialize(await readFile('data/retrospective-latest.json', 'utf8'));
assert.equal(published.refitHash, await retrospectiveSourceHash(filtered.sourceHash));
assert.equal(published.sourceHash, filtered.sourceHash);
assert.match(published.inputSha256, /^[a-f0-9]{64}$/);
assert.ok(published.maximumGradient < 1e-6, 'joint refit converged');
assert.equal(latest.inputSha256, published.inputSha256);
assert.equal(latest.refitHash, published.refitHash);
assert.equal(published.model.snaps.length, filtered.model.snaps.length);
assert.equal(published.model.snaps[0].unified, undefined, 'historical covariance is not shipped');
assert.equal(published.model.snaps[0].drivers[0].overallSd, undefined, 'historical error bars are yearly averages');
assert.deepEqual(published.model.snaps.at(-1), filtered.model.snaps.at(-1), 'latest ratings and covariance remain filtered');
assert.notEqual(
  published.model.snaps[0].drivers.find((r) => r.driverId === '30').overall,
  filtered.model.snaps[0].drivers.find((r) => r.driverId === '30').overall,
);
const materialized = withAnnualUncertainty(published.model);
for (const snapshot of materialized.snaps) {
  const { keys, covariance } = snapshot.unified;
  assert.equal(keys.length, covariance.length);
  const lower = Array.from({ length: keys.length }, () => Array(keys.length).fill(0));
  for (let i = 0; i < keys.length; i++) {
    assert.equal(covariance[i].length, keys.length);
    for (let j = 0; j <= i; j++) {
      assert.ok(Math.abs(covariance[i][j] - covariance[j][i]) < 1e-9, 'published covariance is symmetric');
      let value = covariance[i][j];
      for (let k = 0; k < j; k++) value -= lower[i][k] * lower[j][k];
      if (i === j) {
        assert.ok(value > 0, `published covariance is positive definite at ${snapshot.raceId}`);
        lower[i][j] = Math.sqrt(value);
      } else lower[i][j] = value / lower[j][j];
    }
    const [kind, id] = keys[i];
    const row = kind === 'driver' ? snapshot.drivers.find((item) => item.driverId === id) : snapshot.cars.find((item) => item.carId === id);
    if (row)
      assert.ok(
        Math.abs(Math.sqrt(covariance[i][i]) * (75 / Math.LN10) - row.overallSd) < 0.001,
        `rating uncertainty matches covariance at ${snapshot.raceId}`,
      );
  }
  for (const [kind, rows, key] of [
    ['driver', snapshot.drivers, 'driverId'],
    ['car', snapshot.cars, 'carId'],
  ]) {
    for (const row of rows)
      assert.ok(
        keys.some(([entity, id]) => entity === kind && id === row[key]),
        'rated row has covariance',
      );
  }
}
const filteredHistory = withHistories(filtered.model);
const retrospectiveHistory = withHistories(materialized);
const [currentA, currentB] = filtered.model.snaps.at(-1).drivers;
assert.deepEqual(
  forecastPreWeekend(retrospectiveHistory, currentA.driverId, currentB.driverId),
  forecastPreWeekend(filteredHistory, currentA.driverId, currentB.driverId),
  'current forecast is unchanged',
);
const first = filtered.model.snaps[0];
const [firstA, firstB] = first.drivers;
const side = (driverId) => ({ driverId, when: { kind: 'date', date: first.date } });
const historicalFiltered = scenarioForecast(filteredHistory, side(firstA.driverId), side(firstB.driverId));
const historicalRetrospective = scenarioForecast(retrospectiveHistory, side(firstA.driverId), side(firstB.driverId));
assert.ok(Number.isFinite(historicalRetrospective.sd));
assert.notEqual(historicalRetrospective.gap, historicalFiltered.gap, 'historical scenarios use revised ratings');
for (const [kind, key, histories] of [
  ['drivers', 'driverId', 'dh'],
  ['cars', 'constructorId', 'ch'],
]) {
  const historic = withHistory(published.model.snaps, kind, key);
  for (const row of latest.model.snaps[0][kind]) {
    const expected = historic
      .get(row[key])
      .filter((point) => point.raceId !== latest.model.snaps[0].raceId)
      .at(-1);
    const actual = latest.model[histories].get(row[key])?.at(-1);
    if (expected) assert.equal(actual.overall, expected.overall, 'first screen uses the same earlier retrospective rating');
  }
}
const reference = JSON.parse(await readFile('data/rating-reference.json', 'utf8'));
const displayFull = centredRatings(materialized, reference, published.sourceHash);
const displayLatest = centredRatings(latest.model, reference, latest.sourceHash);
for (const [kind, key, history] of [
  ['drivers', 'driverId', 'dh'],
  ['cars', 'constructorId', 'ch'],
]) {
  for (const row of displayLatest.snaps[0][kind]) {
    const last = displayFull.snaps.at(-1)[kind].find((item) => item[key] === row[key]);
    for (const metric of ['qual', 'race', 'overall']) assert.equal(row[metric], last[metric]);
    const previous = displayFull[history]
      .get(row[key])
      .filter((point) => point.raceId !== displayFull.snaps.at(-1).raceId)
      .at(-1);
    const firstScreenPrevious = displayLatest[history].get(row[key])?.at(-1);
    if (previous) for (const metric of ['qual', 'race', 'overall']) assert.equal(firstScreenPrevious[metric], previous[metric]);
  }
}
function withHistory(snaps, kind, key) {
  const result = new Map();
  for (const snap of snaps)
    for (const row of snap[kind]) {
      const values = result.get(row[key]) ?? [];
      values.push({ ...row, raceId: snap.raceId });
      result.set(row[key], values);
    }
  return result;
}
console.log('PASS retrospective publication: historical estimates, yearly averages, current forecast state and first screen');
