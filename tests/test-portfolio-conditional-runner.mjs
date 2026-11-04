import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const path = 'research/prediction-markets/portfolio/run-conditional.mjs';
const missing = spawnSync(process.execPath, [path], { encoding: 'utf8' });
assert.equal(missing.status, 1);
assert.match(missing.stderr, /Usage/);
const run = spawnSync(
  process.execPath,
  [path, '--assume-retrospective-vintage', '--assume-closed-time-redemption', '--allow-unverified-feed'],
  { encoding: 'utf8' },
);
assert.equal(run.status, 0, run.stderr);
const result = JSON.parse(run.stdout);
assert.match(result.classification, /conditional retrospective/);
assert.equal(result.races.length, 2);
assert.ok(result.races.every((race) => /Verified coverage/.test(race.strictRejection)));
assert.deepEqual(
  result.races.map((race) => race.categoryFeeScenario),
  [0.03, 0.03],
);
assert.ok(result.races.every((race) => race.provenance.historicalForecastVintageVerified === false));
assert.ok(result.settlementSeries.races.every((race) => !race.coverageAttested));
assert.equal(result.settlementSeries.races[0].fills.length, 1);
assert.equal(result.settlementSeries.races[1].fills.length, 0);
assert.ok(Math.abs(result.settlementSeries.finalCapital - 101.1) < 1e-9);
assert.ok(Math.abs(result.races[0].liquidationSensitivity.profit - -0.076565) < 1e-9);
const twoHour = spawnSync(
  process.execPath,
  [path, '--assume-retrospective-vintage', '--assume-closed-time-redemption', '--allow-unverified-feed', '--two-hour-window'],
  { encoding: 'utf8' },
);
assert.equal(twoHour.status, 0, twoHour.stderr);
const extended = JSON.parse(twoHour.stdout);
assert.ok(extended.races.every((race) => race.tradingWindowEnd - race.tradingWindowStart === 7200000));
assert.ok(extended.races.every((race) => /Verified coverage/.test(race.strictRejection)));
assert.match(extended.assumptions.join(' '), /selected after examining activity/);
assert.deepEqual(
  extended.settlementSeries.races.map((race) => race.fills.length),
  [1, 1],
);
assert.ok(Math.abs(extended.settlementSeries.finalCapital - 101.9) < 1e-9);
assert.ok(Math.abs(extended.races[1].liquidationSensitivity.profit - -0.02016) < 1e-9);
const unknown = spawnSync(
  process.execPath,
  [path, '--assume-retrospective-vintage', '--assume-closed-time-redemption', '--allow-unverified-feed', '--unknown'],
  { encoding: 'utf8' },
);
assert.equal(unknown.status, 1);
console.log('PASS explicitly conditional two-race runner');
