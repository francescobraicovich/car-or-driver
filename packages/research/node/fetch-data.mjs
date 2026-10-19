// Refresh the CSVs in data/ from the public mirrors (data/ is committed, so the
// site can serve it and node runs stay repeatable).
import { mkdir, writeFile } from 'node:fs/promises';
import { REMOTE_BASES } from '../../core/src/dataset.js';
import { buildManifest } from '../../../tools/make-data-manifest.mjs';

const FILES = [
  'results.csv',
  'qualifying.csv',
  'races.csv',
  'drivers.csv',
  'constructors.csv',
  'status.csv',
  'lap_times.csv',
  'circuits.csv',
];

async function fetchOne(name) {
  let lastErr = null;
  for (const base of REMOTE_BASES) {
    try {
      const r = await fetch(base + name, { cache: 'no-store' });
      if (!r.ok) throw Error(`HTTP ${r.status}`);
      const text = await r.text();
      if (!text || text.length < 20) throw Error('empty response');
      return { text, url: base + name };
    } catch (e) {
      lastErr = e;
      console.warn('mirror failed', base + name, e.message);
    }
  }
  throw Error(`${name}: ${lastErr?.message}`);
}

const dir = process.argv[2] || 'data';
await mkdir(dir, { recursive: true });
for (const n of FILES) {
  const t0 = performance.now();
  const { text, url } = await fetchOne(n);
  await writeFile(`${dir}/${n}`, text);
  console.log(
    `${n} ${(text.length / 1048576).toFixed(1)}MB via ${url.includes('github') ? 'github' : 'hf'} in ${Math.round(performance.now() - t0)}ms`,
  );
}
const manifest = await buildManifest(dir);
await writeFile(`${dir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `manifest: version ${manifest.version}, latest race ${manifest.lastRace?.year} round ${manifest.lastRace?.round} ${manifest.lastRace?.name}`,
);
console.log('done ->', dir);
