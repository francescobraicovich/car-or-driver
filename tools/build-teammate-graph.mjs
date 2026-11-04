import { readFile, writeFile } from 'node:fs/promises';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { collectExam } from '../packages/core/src/state-space/exam.js';
import { GRAPH_RATINGS } from '../packages/core/src/presets/graph-ratings.js';
import { loadData } from '../packages/research/node/common.mjs';
import { buildTeammateGraph } from './teammate-graph.mjs';

const [modelText, data] = await Promise.all([readFile('data/model.json', 'utf8'), loadData()]);
const model = deserialize(modelText);
const { weekends } = collectExam(data.raw, data.lapSnapshots, data.maps, {}, data.lapPace);
if (
  weekends.length !== model.model.snaps.length ||
  weekends.some((weekend, i) => String(weekend.info.raceId) !== String(model.model.snaps[i].raceId))
) {
  throw Error('Graph and published rating weekends do not match');
}
const snapshots = buildTeammateGraph(weekends, data.raw.drivers);
const output = {
  format: 3,
  sourceHash: model.sourceHash,
  licence: model.licence,
  halfLifeYears: GRAPH_RATINGS.halfLifeYears,
  annualDriftPoints: GRAPH_RATINGS.annualDriftPoints,
  temporalResolution: 'season',
  description: 'Time-linked driver-season graph scores, observed duels and decayed edge evidence through each weekend.',
  snapshots,
};
await writeFile('data/teammate-graph.json', JSON.stringify(output));
console.log(`data/teammate-graph.json: ${snapshots.length} weekends, ${(JSON.stringify(output).length / 1e6).toFixed(1)} MB`);
