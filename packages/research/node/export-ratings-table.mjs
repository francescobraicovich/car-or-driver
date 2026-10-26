// Exports the published hybrid ratings of every weekend, and the retirement-cause table, for the findings computation
// (packages/research/python/compute-findings.py). Writes ratings-table.json and status-causes.json into the directory given as
// the first argument.
//   node packages/research/node/export-ratings-table.mjs <output directory>
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadData } from './common.mjs';
import { buildStateSpace } from '../../core/src/state-space/build.js';
import { defaultClass } from '../../core/src/status.js';

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error('usage: node export-ratings-table.mjs <output directory>');
await mkdir(outputDirectory, { recursive: true });

const ctx = await loadData();
const model = buildStateSpace(ctx.raw, ctx.lapSnapshots, ctx.maps, {}, ctx.lapPace);
const pick = (row, keys) => Object.fromEntries(keys.map((key) => [key, row[key]]));
const weekends = model.snaps.map((snap) => ({
  ...pick(snap, ['raceId', 'year', 'round', 'name', 'date', 'circuitId']),
  drivers: snap.drivers.map((d) =>
    pick(d, [
      'driverId',
      'constructorId',
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
  ),
  cars: snap.cars.map((c) => pick(c, ['constructorId', 'race', 'qual', 'combined', 'raceSd', 'qualSd', 'combinedSd', 'effective', 'q'])),
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
