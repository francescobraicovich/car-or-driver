// data/manifest.json must describe the CSVs it sits next to: the model file's fingerprint (tools/model-source-hash.mjs) is built from its version,
// so a stale manifest would let stale ratings through.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildManifest } from '../tools/make-data-manifest.mjs';

const have = JSON.parse(await readFile('data/manifest.json', 'utf8'));
const want = await buildManifest('data');
assert.deepEqual(have, want, 'data/manifest.json is stale: run node tools/make-data-manifest.mjs (fetch-data.mjs does it)');
assert.ok(have.lastRace?.year >= 2000 && have.lastRace.round >= 1, 'the manifest names the latest race with results');
console.log(
  `PASS data manifest: matches the CSVs (version ${have.version}, latest race ${have.lastRace.year} round ${have.lastRace.round})`,
);
