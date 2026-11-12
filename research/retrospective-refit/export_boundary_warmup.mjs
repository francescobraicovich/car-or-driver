// Construct a research-only 1990 warm-up using the production weekend and evidence builders.
// The production module's boundary is changed only in an in-memory module copy.
import { readFile, writeFile } from 'node:fs/promises';
import { loadData } from '../../packages/research/node/common.mjs';
import { collectExam } from '../../packages/core/src/state-space/exam.js';
import { entrants, measurementRows, retainedLaps } from '../../packages/core/node/unified-evidence.mjs';

const weekendPath = new URL('../../packages/core/src/weekends.js', import.meta.url);
const wetRacesUrl = new URL('../../packages/core/src/wet-races.js', import.meta.url).href;
const original = await readFile(weekendPath, 'utf8');
if (!original.includes('export const FIRST_YEAR = 1994;') || !original.includes("'./wet-races.js'"))
  throw Error('Production weekend source has changed; review the warm-up export');
const source = original
  .replace('export const FIRST_YEAR = 1994;', 'export const FIRST_YEAR = 1990;')
  .replace("'./wet-races.js'", JSON.stringify(wetRacesUrl));
const { prepareWeekends } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const data = await loadData();
const prep = prepareWeekends(data.raw);
const { weekends } = collectExam(data.raw, data.lapSnapshots, data.maps, {}, data.lapPace, { prep });
const laps = await retainedLaps();
const excludeBeyondResults = process.argv.includes('--exclude-beyond-results');
let excludedLaps = 0;
if (excludeBeyondResults) {
  const years = new Map(data.raw.races.map((race) => [String(race.raceId), Number(race.year)]));
  for (const row of data.raw.results) {
    const year = years.get(String(row.raceId));
    const completed = Number(row.laps);
    if (!(year >= 1990 && year < 1994 && Number.isInteger(completed) && completed >= 0)) continue;
    const driverLaps = laps.get(`${row.raceId}|${row.driverId}`);
    if (!driverLaps) continue;
    for (const lap of driverLaps.keys())
      if (lap > completed) {
        driverLaps.delete(lap);
        excludedLaps++;
      }
  }
}
const settings = JSON.parse(await readFile('packages/core/python/unified-settings.json', 'utf8'));
const inputs = weekends.map((weekend) => ({
  raceId: String(weekend.info.raceId),
  date: weekend.info.date,
  entries: entrants(weekend),
  observations: measurementRows(weekend, data.lapPace, laps, settings.refinements),
}));
const destination = excludeBeyondResults
  ? 'tmp/retrospective-refit/boundary-warmup-clipped-input.json'
  : 'tmp/retrospective-refit/boundary-warmup-input.json';
await writeFile(destination, JSON.stringify(inputs));
console.log(`Exported ${inputs.length} weekends beginning ${inputs[0].date}; excluded ${excludedLaps} laps`);
