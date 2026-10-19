// A fingerprint of everything the shipped ratings are computed from: the version of the data (data/manifest.json) and the source of the model
// (every file under packages/core/src and the tool that builds and trims it). The built model records it, and tests/test-model-file.mjs fails if it
// no longer matches, so a change to the data or to the model cannot be published with ratings that were computed before it.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? sourceFiles(join(directory, entry.name)) : [join(directory, entry.name)])),
  );
  return files.flat().filter((file) => file.endsWith('.js'));
}

export async function modelSourceHash(root = '.') {
  const manifest = JSON.parse(await readFile(join(root, 'data/manifest.json'), 'utf8'));
  const files = [...(await sourceFiles(join(root, 'packages/core/src'))).sort(), join(root, 'tools/build-model.mjs')];
  const hash = createHash('sha256').update(manifest.version);
  for (const file of files) hash.update(file.slice(root.length)).update(await readFile(file));
  return { sourceHash: hash.digest('hex').slice(0, 16), lastRace: manifest.lastRace };
}
