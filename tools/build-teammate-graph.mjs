import { readFile, writeFile } from 'node:fs/promises';
import { csv } from '../packages/core/src/csv.js';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { buildTeammateGraph } from './teammate-graph.mjs';

const [modelText, resultText, qualText, driverText] = await Promise.all([
  readFile('data/model.json', 'utf8'),
  readFile('data/results.csv', 'utf8'),
  readFile('data/qualifying.csv', 'utf8'),
  readFile('data/drivers.csv', 'utf8'),
]);
const model = deserialize(modelText);
const snapshots = buildTeammateGraph(model.model.snaps, csv(resultText), csv(qualText), csv(driverText));
const output = {
  format: 1,
  sourceHash: model.sourceHash,
  licence: model.licence,
  description: 'Dated teammate-only graph scores and qualifying/race duels. Each snapshot includes only evidence through its own weekend.',
  snapshots,
};
await writeFile('data/teammate-graph.json', JSON.stringify(output));
console.log(`data/teammate-graph.json: ${snapshots.length} weekends, ${(JSON.stringify(output).length / 1e6).toFixed(1)} MB`);
