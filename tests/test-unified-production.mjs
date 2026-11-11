import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { withHistories } from '../packages/core/src/weekend-histories.js';
import { forecastPreWeekend, gapVariance, prepareUnifiedForecast, POINTS } from '../packages/core/src/unified/forecast.js';
import { scenarioForecast } from '../packages/core/src/unified/scenario.js';
import { summarizeBacktest } from '../packages/core/src/backtest.js';

const reference = JSON.parse(await readFile('tests/fixtures/unified-inference.json', 'utf8'));
const close = (actual, expected, allowance = 3e-5) => assert.ok(Math.abs(actual - expected) < allowance, `${actual} != ${expected}`);
for (const fixture of reference.fixtures) {
  const actual = forecastPreWeekend(reference.model, fixture.a, fixture.b, { date: fixture.date });
  const reverse = forecastPreWeekend(reference.model, fixture.b, fixture.a, { date: fixture.date });
  close(actual.p, fixture.expected.overall.actualResultProbability);
  close(actual.competitive, fixture.expected.overall.competitiveWinProbability);
  close(actual.p + reverse.p, 1, 1e-10);
  for (const channel of ['qual', 'race']) {
    close(actual.timing[channel].fractionalTimeAdvantage, fixture.expected[channel].fractionalTimeAdvantage, 2e-6);
    actual.timing[channel].predictiveInterval90.forEach((value, i) =>
      close(value, fixture.expected[channel].predictiveInterval90[i], 2e-6),
    );
  }
}
const model = withHistories(deserialize(await readFile('data/model.json', 'utf8')).model);
const last = model.snaps.at(-1);
assert.equal(model.params.modelKind, 'unified');
assert.equal(model.params.ratingReference, 'model-prior');
for (const kind of ['drivers', 'cars']) {
  const mean = last[kind].reduce((sum, row) => sum + row.overall, 0) / last[kind].length;
  assert.ok(Math.abs(mean - 1000) > 1, `${kind}: current average is not forced to the prior reference`);
}
assert.ok(!model.ss && !model.formShifts && !model.forecastState.heads);
const [a, b] = last.drivers;
const forecast = prepareUnifiedForecast(model);
assert.throws(() => prepareUnifiedForecast(model, { date: '2026-02-30' }), /date/);
assert.throws(() => prepareUnifiedForecast(model, { date: '1900-01-01' }), /date/);
assert.throws(() => prepareUnifiedForecast(model, { circuitId: '1' }), /pre-weekend/);
assert.throws(() => forecast(a.driverId, b.driverId, { L: -2 }), /distance/);
assert.throws(() => forecast(a.driverId, b.driverId, { gridA: -1, gridB: 2 }), /Grid/);
assert.equal(forecast(a.driverId, b.driverId, { gridA: 1, gridB: 2 }).forecastMode, 'grid');
assert.equal(forecast(a.driverId, a.driverId), null);
assert.equal(forecast(a.driverId, 'unknown'), null);
for (const car of last.cars) {
  const teammates = last.drivers.filter((row) => row.constructorId === car.constructorId);
  if (teammates.length < 2) continue;
  const terms = [
    ['driver', teammates[0].driverId, 1],
    ['driver', teammates[1].driverId, -1],
  ];
  close(gapVariance(last.unified, terms), gapVariance(last.unified, [...terms, ['car', car.carId, 1], ['car', car.carId, -1]]), 1e-12);
}
const sideA = { driverId: a.driverId, when: { kind: 'latest' } };
const sideB = { driverId: b.driverId, when: { kind: 'latest' } };
const scenario = scenarioForecast(model, sideA, sideB);
close(
  scenario.gap,
  a.overall -
    b.overall +
    last.cars.find((c) => c.constructorId === a.constructorId).overall -
    last.cars.find((c) => c.constructorId === b.constructorId).overall,
  1e-8,
);
close(scenario.p + scenarioForecast(model, sideB, sideA).p, 1, 1e-10);
assert.equal(scenario.approximate, false);
assert.ok(scenarioForecast(model, sideA, sideB, { wet: true }).error);
const early = { driverId: a.driverId, when: { kind: 'date', date: model.dh.get(a.driverId)[0].date } };
assert.equal(scenarioForecast(model, early, sideB).approximate, true);
const identical = scenarioForecast(model, sideA, sideA);
close(identical.p, 0.5, 1e-10);
close(identical.sd, 0, 1e-10);
const historical = summarizeBacktest(model, { fromYear: 2008, toYear: 2025, burnIn: 0 });
close(historical.overall.raceLogLoss, 0.530117192124, 2e-6);
for (const snap of model.snaps)
  for (const kind of ['drivers', 'cars'])
    for (const row of snap[kind]) {
      assert.equal(row.combined, row.overall, 'compatibility field is overall, not a blend');
      for (const key of ['qual', 'race', 'overall', 'qualSd', 'raceSd', 'overallSd']) assert.ok(Number.isFinite(row[key]));
      const entity = kind === 'drivers' ? 'driver' : 'car';
      const identity = kind === 'drivers' ? row.driverId : row.carId;
      close(row.overallSd, POINTS * Math.sqrt(gapVariance(snap.unified, [[entity, identity, 1]])), 0.0001);
    }
console.log(
  `PASS unified production: ${reference.fixtures.length} Python inference fixtures, covariance cancellation, scenarios, invalid inputs and selected historical score`,
);
