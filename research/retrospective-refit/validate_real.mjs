// Compare the refitted raw ratings and selected covariance blocks with the published filter.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { deserialize } from '../../packages/core/src/json-serialization.js';

const paths = ['tmp/retrospective-refit/input.json', 'tmp/retrospective-refit/result.json', 'data/model.json'];
const [inputText, resultText, modelText] = await Promise.all(paths.map((path) => readFile(path, 'utf8')));
const inputs = JSON.parse(inputText);
const result = JSON.parse(resultText);
const file = deserialize(modelText);
const snapshots = file.model.snaps;
if (
  inputs.length !== snapshots.length ||
  result.history.length !== snapshots.length ||
  inputs.some((weekend, index) => String(weekend.raceId) !== String(snapshots[index].raceId))
)
  throw Error('Refit input and published filter must cover the same races');
const points = 75 / Math.log(10);
const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)];
const describe = (values) => ({
  count: values.length,
  mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  median: quantile(values, 0.5),
  p95: quantile(values, 0.95),
  maximum: Math.max(...values),
});
const differences = { driver: [], car: [] };
const byDecade = {};
for (const [index, snap] of snapshots.entries()) {
  const decade = String(Math.floor(Number(snap.year) / 10) * 10);
  byDecade[decade] ??= { driver: [], car: [] };
  for (const [kind, rows, key] of [
    ['driver', snap.drivers, 'driverId'],
    ['car', snap.cars, 'carId'],
  ]) {
    for (const row of rows) {
      const value = result.history[index][kind][String(row[key])];
      if (!value) throw Error(`Missing ${kind} state ${row[key]} at ${index}`);
      const change = Math.abs(1000 + value[2] - row.overall);
      differences[kind].push(change);
      byDecade[decade][kind].push(change);
    }
  }
}
const covariance = {};
for (const index of ['0', String(Math.floor((snapshots.length - 1) / 2)), String(snapshots.length - 1)]) {
  const block = result.covariance[index];
  if (!block) throw Error(`Missing covariance block ${index}`);
  const snap = snapshots[Number(index)];
  const indices = new Map(block.keys.map((key, i) => [key.join(':'), 3 * i + 2]));
  covariance[index] = { date: snap.date };
  for (const [kind, rows, key] of [
    ['driver', snap.drivers, 'driverId'],
    ['car', snap.cars, 'carId'],
  ]) {
    const changes = rows.map((row) => {
      const i = indices.get(`${kind}:${row[key]}`);
      if (i === undefined) throw Error('Covariance is missing a published entity');
      return points * Math.sqrt(block.matrix[i][i]) - row.overallSd;
    });
    covariance[index][kind] = {
      meanSdChangePoints: changes.reduce((sum, value) => sum + value, 0) / changes.length,
      minimumSdChangePoints: Math.min(...changes),
      maximumSdChangePoints: Math.max(...changes),
    };
  }
}
const output = {
  filterSourceHash: file.sourceHash,
  inputSha256: createHash('sha256').update(inputText).digest('hex'),
  settingsSha256: createHash('sha256')
    .update(await readFile('packages/core/python/unified-settings.json'))
    .digest('hex'),
  lastRace: file.lastRace,
  elapsedSeconds: result.elapsedSeconds,
  iterations: result.iterations,
  maxGradient: result.maximumGradient,
  states: result.states,
  observations: result.observations,
  covarianceWeekends: covariance,
  absoluteOverallRatingChanges: Object.fromEntries(Object.entries(differences).map(([kind, values]) => [kind, describe(values)])),
  byDecade: Object.fromEntries(
    Object.entries(byDecade).map(([decade, values]) => [
      decade,
      Object.fromEntries(Object.entries(values).map(([kind, entries]) => [kind, describe(entries)])),
    ]),
  ),
  limitations:
    'Raw model-prior coordinates; the refit uses later data and a different joint approximation. Revisions are not evidence of accuracy. Covariance is local Laplace conditional on fixed settings and composite evidence.',
};
await writeFile('research/retrospective-refit/validation-real.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
