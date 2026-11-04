import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { collectExam } from '../packages/core/src/state-space/exam.js';
import { teammateGraphExam } from '../packages/core/src/teammate-graph-exam.js';
import { GRAPH_RATINGS } from '../packages/core/src/presets/graph-ratings.js';
import { loadData } from '../packages/research/node/common.mjs';
import { buildTeammateGraph } from '../tools/teammate-graph.mjs';

const a = { driverId: 'a', constructorId: 'x' };
const b = { driverId: 'b', constructorId: 'x' };
const c = { driverId: 'c', constructorId: 'x' };
const item = (ob, session) => ({ ob, session });
const qualify = (x, y) => ({ x, y, obs: 1, seg: 'q1', tx: 80, ty: 81 });
const pace = (x, y) => ({ x, y, obs: 1, source: 'paceW', base: 0.375 });
const finish = (x, y) => ({ x, y, obs: 1, source: 'finish', base: 12 });
const weekend = (raceId, date, rows, replayObs) => ({ info: { raceId, date, year: +date.slice(0, 4), round: 1 }, rows, replayObs });
const weekends = [
  weekend('1', '2020-09-29', [a, b], [item(qualify(a, b), 'qual'), item(pace(a, b), 'race')]),
  weekend('2', '2020-09-30', [b, c], [item(finish(b, c), 'race')]),
];
const drivers = [{ driverId: 'a', dob: '1997-09-30' }];
const full = buildTeammateGraph(weekends, drivers);
assert.deepEqual(full[0], buildTeammateGraph(weekends.slice(0, 1), drivers)[0], 'future weekends cannot change a graph');
assert.equal(full[0].nodes.find((node) => node[0] === 'a')[4], 22);
assert.equal(full[1].nodes.find((node) => node[0] === 'a')[4], 23);
assert.equal(full[1].nodes.find((node) => node[0] === 'a')[5], 2020, 'graph level has a distinct strength season');
assert.deepEqual(full[0].duels, [['a', 'b', 1, 1, 0.75, 'paceW']]);
assert.equal(full[0].edges[0][2], 1.75, 'qualifying and coverage-weighted race evidence match the graph');
assert(full[0].nodes.find((node) => node[0] === 'a')[1] > 1000);
assert(full[1].nodes.find((node) => node[0] === 'a')[1] > full[1].nodes.find((node) => node[0] === 'c')[1]);
const later = [weekends[0], weekend('2', '2025-09-30', [b, c], [item(finish(b, c), 'race')])];
const decayed = buildTeammateGraph(later, drivers);
assert(decayed[1].edges.find(([x, y]) => x === 'a' && y === 'b')[2] < decayed[0].edges[0][2], 'edge evidence decays with calendar time');
const graph = teammateGraphExam(weekends, { halfLifeYears: GRAPH_RATINGS.halfLifeYears });
for (const [i, snap] of full.entries())
  for (const node of snap.nodes) {
    assert.equal(node[1], Math.round((1000 + graph[i].post.levels.get(node[0])) * 10) / 10, 'displayed graph uses production levels');
  }

if (!process.env.GRAPH_SYNTHETIC_ONLY) {
  const [text, modelText, data] = await Promise.all([
    readFile('data/teammate-graph.json', 'utf8'),
    readFile('data/model.json', 'utf8'),
    loadData(),
  ]);
  const published = JSON.parse(text);
  const model = deserialize(modelText);
  const collected = collectExam(data.raw, data.lapSnapshots, data.maps, {}, data.lapPace).weekends;
  assert.equal(published.format, 3);
  assert.equal(published.temporalResolution, 'season');
  assert.equal(published.annualDriftPoints, GRAPH_RATINGS.annualDriftPoints);
  assert.equal(published.sourceHash, model.sourceHash);
  assert.equal(published.halfLifeYears, GRAPH_RATINGS.halfLifeYears);
  assert.deepEqual(
    published.snapshots.map((snap) => snap.raceId),
    model.model.snaps.map((snap) => snap.raceId),
  );
  assert.deepEqual(published.snapshots, buildTeammateGraph(collected, data.raw.drivers), 'published graph matches production evidence');
  for (const [raceId, one, two] of [
    ['932', '8', '20'],
    ['1052', '20', '840'],
    ['1099', '846', '857'],
  ]) {
    const duel = published.snapshots.find((snap) => snap.raceId === raceId)?.duels.find((pair) => pair.includes(one) && pair.includes(two));
    assert(!duel || duel[2] === 0, `interrupted qualifying ${raceId} is not evidence`);
  }
  assert(
    published.snapshots.find((snap) => snap.raceId === '1063')?.duels.every((duel) => duel[3] === 0),
    'safety-car race is not evidence',
  );
}
console.log('PASS teammate graph: dated production evidence, decayed edges and metadata');
