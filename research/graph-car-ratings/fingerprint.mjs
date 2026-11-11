import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { modelSourceHash } from '../../tools/model-source-hash.mjs';

/** Fingerprint the model, evaluation, experiment code and actual input tables. */
export async function experimentFingerprint() {
  const hash = createHash('sha256').update(JSON.stringify(await modelSourceHash()));
  const files = [
    'data/manifest.json',
    'research/graph-car-ratings/README.md',
    'research/stable-ratings/metrics.mjs',
    'research/stable-ratings/synthetic-weekends.mjs',
  ];
  for (const [directory, extension] of [
    ['packages/eval/src', '.js'],
    ['packages/research/node', '.mjs'],
    ['research/graph-car-ratings', '.mjs'],
    ['data', '.csv'],
  ]) {
    for (const name of await readdir(directory)) if (name.endsWith(extension)) files.push(`${directory}/${name}`);
  }
  for (const path of files.sort())
    hash
      .update(path)
      .update('\0')
      .update(await readFile(path))
      .update('\0');
  return hash.digest('hex');
}
