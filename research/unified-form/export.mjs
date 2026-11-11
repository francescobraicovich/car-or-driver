import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadData } from '../../packages/research/node/common.mjs';
import { collectExam } from '../../packages/core/src/state-space/exam.js';
import { entrants, measurementRows, outcomeRows, retainedLaps } from '../../packages/core/node/unified-evidence.mjs';
import { modelSourceHash } from '../../tools/model-source-hash.mjs';

const data = await loadData();
const { model, weekends } = collectExam(data.raw, data.lapSnapshots, data.maps, {}, data.lapPace);
const laps = await retainedLaps();
const settings = JSON.parse(await readFile('packages/core/python/unified-settings.json', 'utf8'));
const previous = new Map();
const payload = weekends.map((weekend, index) => {
  const entries = entrants(weekend);
  const grid = new Map(weekend.rawRows.map((row) => [String(row.driverId), +row.grid || null]));
  for (const entry of entries) {
    const old = previous.get(entry.driver);
    entry.moveAppearance = old && old.car !== entry.car ? 1 : old?.moveAppearance ? old.moveAppearance + 1 : 0;
    entry.grid = grid.get(entry.driver) || null;
    previous.set(entry.driver, { car: entry.car, moveAppearance: entry.moveAppearance });
  }
  return {
    raceId: String(weekend.info.raceId),
    year: weekend.year,
    date: weekend.info.date,
    circuit: String(weekend.info.circuitId),
    wet: weekend.year >= 2000 && weekend.year <= 2025 ? model.snaps[index].diag.wet : null,
    entries,
    observations: measurementRows(weekend, data.lapPace, laps, settings.refinements),
    tests: [...measurementRows(weekend, data.lapPace, laps).filter((row) => row.channel < 2), ...outcomeRows(weekend)],
  };
});
await mkdir('tmp/unified-form', { recursive: true });
const output = JSON.stringify({ settings, publication: await modelSourceHash(), weekends: payload });
await writeFile('tmp/unified-form/input.json', output);
await writeFile(
  'research/unified-form/input-manifest.json',
  JSON.stringify(
    {
      inputHash: createHash('sha256').update(output).digest('hex'),
      publication: await modelSourceHash(),
      weekends: payload.length,
      measurements: payload.reduce((sum, row) => sum + row.observations.length, 0),
      outcomeCutoff: 'All rating features precede the weekend; grid and realized weather are separate conditional inputs.',
    },
    null,
    2,
  ) + '\n',
);
console.log(`Exported ${payload.length} weekends, ${(output.length / 1e6).toFixed(1)} MB`);
