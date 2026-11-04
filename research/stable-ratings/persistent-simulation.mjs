// Both sessions and graph evidence come from the same simulated world.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { load } from '../../packages/research/node/strict-eval.mjs';
import { bothSessions } from '../../packages/research/node/simulation-both.mjs';
import { indexTimeline, findMoves, truthMetrics, worldFromHyper, worldParamsV2 } from '../../packages/eval/src/index.js';
import { carLineage } from '../../packages/core/src/state-space/build.js';
import { staticGraphExam as teammateGraphExam } from '../temporal-graph/static-graph-exam.mjs';
import { persistentSession } from './persistent-candidates.mjs';
import { rankingCandidates } from '../simplification/candidates-ranking.mjs';

import { simulatedWeekends } from './synthetic-weekends.mjs';

async function main() {
  const env = await load(2015);
  const originalIndex = indexTimeline(env.timeline, env.prep.ctx);
  const center = (snapshot) => {
    const update = (map, cars = false) => {
      const unique = new Map([...map].map(([id, value]) => [cars ? carLineage(id) : id, value.m]));
      const average = [...unique.values()].reduce((sum, value) => sum + value, 0) / unique.size;
      return new Map([...map].map(([id, value]) => [id, { ...value, m: value.m - average, sd: null }]));
    };
    return { drivers: update(snapshot.drivers), cars: update(snapshot.cars, true) };
  };
  const scenarios = { default: {}, 'persistent-fit': { sdInt: { race: 15, qual: 5.4 }, rhoInt: 0.95 } };
  const records = [];
  for (const [scenario, overrides] of Object.entries(scenarios)) for (const seed of [1, 2, 3]) {
    const world = bothSessions(env.timeline, originalIndex, worldParamsV2(worldFromHyper, {}, overrides), seed);
    const idx = indexTimeline(world.timeline, env.prep.ctx), moves = findMoves(idx);
    const weekends = simulatedWeekends(world.timeline);
    const baseline = rankingCandidates['without-qualifying-car-link']({ ...env, timeline: world.timeline });
    const graph = teammateGraphExam(weekends, { halfLifeYears: 3 });
    const selected = Object.fromEntries(['race', 'qual'].map((session) => [session, persistentSession(world.timeline, baseline[session], graph, 0.25, 0.05)]));
    const runs = { baseline, selected };
    for (const [model, pair] of Object.entries(runs)) for (const session of ['race', 'qual']) {
      const run = { ...pair[session], post: pair[session].post.map(center) };
      const result = truthMetrics(idx, run, { truth: session === 'race' ? world.truth : world.truthQual }, { boot: { B: 0 }, moves });
      records.push({ scenario, seed, model, session, driverRmse: result.rmseDriver.est, carRmse: result.rmseCar.est,
        teammateGapRmse: result.gapRmse.mates.est, fieldGapRmse: result.gapRmse.cars.est,
        winterLeak: result.leakTruth.winterUnchanged.est, seasonLeak: result.leakTruth.season.est,
        carCapture: result.carCapture.est, moverStepRmse: result.moverStepError.rms });
    }
    console.log(`Completed ${scenario}, seed ${seed}`);
  }
  const metrics = ['driverRmse', 'carRmse', 'teammateGapRmse', 'fieldGapRmse', 'winterLeak', 'seasonLeak', 'carCapture', 'moverStepRmse'];
  const summary = {};
  for (const scenario of Object.keys(scenarios)) for (const session of ['race', 'qual']) {
    summary[`${scenario}.${session}`] = Object.fromEntries(metrics.map((metric) => {
      const values = (model) => records.filter((row) => row.scenario === scenario && row.session === session && row.model === model).map((row) => row[metric]);
      const average = (xs) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
      const baseline = values('baseline'), selected = values('selected');
      return [metric, { baseline: average(baseline), selected: average(selected), difference: average(selected.map((value, i) => value - baseline[i])) }];
    }));
  }
  const protocol = 'Simulator v2 on the real calendar through 2015; both sessions and graph evidence simulated; three paired seeds per scenario. Retrospective stress tests, not real-world validation. Recovery begins after two initial seasons. Uncertainty coverage is not evaluated.';
  await writeFile('research/stable-ratings/persistent-simulation-results.json', `${JSON.stringify({ protocol, scenarios, seeds: [1, 2, 3], summary, records }, null, 2)}\n`);
  const lines = ['# Rejected persistent-model synthetic truth recovery', '', protocol, '', '| Scenario / session | Driver RMSE baseline / selected | Car RMSE baseline / selected | Teammate-gap RMSE baseline / selected | Field-gap RMSE baseline / selected | Mover-step RMSE baseline / selected |', '| --- | --- | --- | --- | --- | --- |'];
  const fmt = (x) => Number.isFinite(x) ? x.toFixed(2) : 'unavailable';
  for (const [key, row] of Object.entries(summary)) lines.push(`| ${key} | ${fmt(row.driverRmse.baseline)} / ${fmt(row.driverRmse.selected)} | ${fmt(row.carRmse.baseline)} / ${fmt(row.carRmse.selected)} | ${fmt(row.teammateGapRmse.baseline)} / ${fmt(row.teammateGapRmse.selected)} | ${fmt(row.fieldGapRmse.baseline)} / ${fmt(row.fieldGapRmse.selected)} | ${fmt(row.moverStepRmse.baseline)} / ${fmt(row.moverStepRmse.selected)} |`);
  lines.push('', 'These results are sensitive to the simulator assumptions; three seeds do not establish real-world accuracy. Per-seed results and further diagnostics are in the accompanying JSON.', '');
  await writeFile('research/stable-ratings/persistent-simulation-results.md', lines.join('\n'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
