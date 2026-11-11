import { readFile, writeFile } from 'node:fs/promises';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { collectExam } from '../packages/core/src/state-space/exam.js';
import { retainedLaps } from '../packages/core/node/unified-evidence.mjs';
import { loadData } from '../packages/research/node/common.mjs';
import { buildUnifiedTeammateGraph } from './unified-teammate-graph.mjs';

const [modelText, data] = await Promise.all([readFile('data/model.json', 'utf8'), loadData()]);
const model = deserialize(modelText);
const { weekends } = collectExam(data.raw, data.lapSnapshots, data.maps, {}, data.lapPace);
if (
  weekends.length !== model.model.snaps.length ||
  weekends.some((weekend, i) => String(weekend.info.raceId) !== String(model.model.snaps[i].raceId))
) {
  throw Error('Graph and published rating weekends do not match');
}
const snapshots = buildUnifiedTeammateGraph(model.model, weekends, data.raw.drivers, data.lapPace, await retainedLaps());
const output = {
  format: 4,
  sourceHash: model.sourceHash,
  licence: model.licence,
  rating: 'overall',
  temporalResolution: 'weekend',
  description: 'Published unified overall ratings at latest appearance, connected by cumulative weighted teammate evidence.',
  snapshots,
};
await writeFile('data/teammate-graph.json', JSON.stringify(output));
console.log(`data/teammate-graph.json: ${snapshots.length} weekends, ${(JSON.stringify(output).length / 1e6).toFixed(1)} MB`);
