// Export the same observations used by the production model, without changing published files.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadData } from '../../packages/research/node/common.mjs';
import { collectExam } from '../../packages/core/src/state-space/exam.js';
import { entrants, measurementRows, retainedLaps } from '../../packages/core/node/unified-evidence.mjs';

const data = await loadData();
const { weekends } = collectExam(data.raw, data.lapSnapshots, data.maps, {}, data.lapPace);
const laps = await retainedLaps();
const settings = JSON.parse(await readFile('packages/core/python/unified-settings.json', 'utf8'));
const inputs = weekends.map((weekend) => ({
  raceId: String(weekend.info.raceId),
  date: weekend.info.date,
  entries: entrants(weekend),
  observations: measurementRows(weekend, data.lapPace, laps, settings.refinements),
}));
await mkdir('tmp/retrospective-refit', { recursive: true });
await writeFile('tmp/retrospective-refit/input.json', JSON.stringify(inputs));
console.log(`Exported ${inputs.length} weekends to tmp/retrospective-refit/input.json`);
