// Exports the published unified ratings of every weekend, and the retirement-cause table, for the findings computation
// (packages/research/python/compute-findings.py). Writes ratings-table.json and status-causes.json into the directory given as
// the first argument.
//   node packages/research/node/export-ratings-table.mjs <output directory>
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deserialize } from '../../core/src/json-serialization.js';
import { defaultClass } from '../../core/src/status.js';
import { gapVariance, POINTS } from '../../core/src/unified/forecast.js';

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error('usage: node export-ratings-table.mjs <output directory>');
await mkdir(outputDirectory, { recursive: true });

const model = deserialize(await readFile('data/model.json', 'utf8')).model;
const pick = (row, keys) => Object.fromEntries(keys.map((key) => [key, row[key]]));
// Insights labelled "above the field" use an explicit relative projection,
// including its covariance, while preserving the published fixed-reference values.
function fieldOverallSd(snap, kind, identity) {
  const members = snap.unified.keys.filter(([entityKind]) => entityKind === kind);
  return POINTS * Math.sqrt(gapVariance(snap.unified, [[kind, identity, 1], ...members.map(([k, id]) => [k, id, -1 / members.length])]));
}
const weekends = model.snaps.map((snap) => ({
  ...pick(snap, ['raceId', 'year', 'round', 'name', 'date', 'circuitId']),
  drivers: snap.drivers.map((d) => ({
    ...pick(d, [
      'driverId',
      'constructorId',
      'overall',
      'overallSd',
      'race',
      'qual',
      'combined',
      'raceSd',
      'qualSd',
      'combinedSd',
      'effective',
      'packagePace',
      'q',
      'races',
      'newDriver',
    ]),
    fieldOverallSd: fieldOverallSd(snap, 'driver', d.driverId),
  })),
  cars: snap.cars.map((c) => ({
    ...pick(c, ['constructorId', 'overall', 'overallSd', 'race', 'qual', 'combined', 'raceSd', 'qualSd', 'combinedSd', 'effective', 'q']),
    fieldOverallSd: fieldOverallSd(snap, 'car', c.carId),
  })),
}));
await writeFile(
  join(outputDirectory, 'ratings-table.json'),
  JSON.stringify({ weekends, driverNames: [...model.dname], constructorNames: [...model.cname] }),
);

const statusLines = (await readFile('data/status.csv', 'utf8')).trim().split('\n').slice(1);
const causes = {};
for (const line of statusLines) {
  const comma = line.indexOf(',');
  const status = line.slice(comma + 1).replace(/"/g, '');
  causes[line.slice(0, comma)] = { status, ...defaultClass(status) };
}
await writeFile(join(outputDirectory, 'status-causes.json'), JSON.stringify(causes));
console.log(`wrote ${weekends.length} weekends to ${outputDirectory}`);
