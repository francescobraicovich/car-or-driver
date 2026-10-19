// Verify every WET_RACES entry matches exactly one raceId in races.csv.
import { readFile } from 'node:fs/promises';
import { csv } from '../../core/src/csv.js';
import { WET_RACES } from '../../core/src/wet-races.js';

const races = csv(await readFile(process.argv[2] || 'data/races.csv', 'utf8'));
const byKey = new Map();
for (const r of races) {
  const k = `${+r.year}|${r.name}`;
  byKey.set(k, [...(byKey.get(k) || []), r.raceId]);
}
let bad = 0;
const perYear = {};
for (const w of WET_RACES) {
  const hit = byKey.get(`${w.year}|${w.gp}`) || [];
  perYear[w.year] = (perYear[w.year] || 0) + 1;
  if (hit.length !== 1) {
    bad++;
    console.log(`AMBIGUOUS/MISSING ${w.year} ${w.gp}: [${hit.join(',')}]`);
  }
}
console.log('per-year counts:', JSON.stringify(perYear));
console.log(bad ? `FAIL: ${bad} bad entries` : `OK: all ${WET_RACES.length} entries match exactly one race`);
process.exit(bad ? 1 : 0);
