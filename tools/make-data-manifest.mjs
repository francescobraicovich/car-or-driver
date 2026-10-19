// Writes data/manifest.json: a version hash of the CSVs and the latest race with results. The built ratings are fingerprinted with it
// (tools/model-source-hash.mjs), and tests/test-insights.mjs checks the findings against it. Run by fetch-data.mjs; a test
// (tests/test-data-manifest.mjs) fails if the manifest does not match the files.
//   node tools/make-data-manifest.mjs [dir]
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { csv } from '../packages/core/src/csv.js';

export const MANIFEST_FILES = [
  'results.csv',
  'qualifying.csv',
  'races.csv',
  'drivers.csv',
  'constructors.csv',
  'status.csv',
  'lap_times.csv',
  'circuits.csv',
];

/** The manifest of the CSVs in `dir`: per-file size and sha256, a version, and the latest race that has results. */
export async function buildManifest(dir) {
  const files = {};
  const texts = {};
  for (const name of MANIFEST_FILES) {
    const buf = await readFile(`${dir}/${name}`);
    texts[name] = buf.toString('utf8');
    files[name] = { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
  }
  const version = createHash('sha256')
    .update(MANIFEST_FILES.map((n) => files[n].sha256).join(''))
    .digest('hex')
    .slice(0, 16);
  const withResults = new Set(csv(texts['results.csv']).map((r) => r.raceId));
  const done = csv(texts['races.csv'])
    .filter((r) => withResults.has(r.raceId))
    .sort((a, b) => +a.year - +b.year || +a.round - +b.round)
    .at(-1);
  return {
    version,
    lastRace: done ? { year: +done.year, round: +done.round, name: done.name, date: done.date } : null,
    files,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] || 'data';
  const manifest = await buildManifest(dir);
  await writeFile(`${dir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `${dir}/manifest.json: version ${manifest.version}, latest race ${manifest.lastRace?.year} round ${manifest.lastRace?.round} ${manifest.lastRace?.name}`,
  );
}
