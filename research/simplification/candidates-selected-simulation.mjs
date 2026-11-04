// Paired truth-recovery comparison: selected production and frozen original.
// Both race and qualifying observations come from the same synthetic world.
import { writeFile } from 'node:fs/promises';
import { load } from '../../packages/research/node/strict-eval.mjs';
import { bothSessions } from '../../packages/research/node/simulation-both.mjs';
import { indexTimeline, findMoves, truthMetrics, worldFromHyper, worldParamsV2 } from '../../packages/eval/src/index.js';
import { runSession, carLineage } from '../../packages/core/src/state-space/build.js';
import { hybridRatings } from '../../packages/core/src/hybrid/ratings.js';
import { STATE_SPACE } from '../../packages/core/src/presets/state-space.js';
import { rankingCandidates } from './candidates-ranking.mjs';

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
function selected(timeline) {
  const weekends = env.prep.weekends.slice(0, timeline.length).map((weekend, i) => ({
    ...weekend, raceObs: timeline[i].obs.race, qualObs: timeline[i].obs.qual,
  }));
  const qualifying = runSession(weekends, 'qual', env.prep.ctx.tmBoost);
  const race = hybridRatings(weekends, runSession(weekends, 'race', env.prep.ctx.tmBoost, qualifying), qualifying, carLineage);
  const adapt = (session, raw) => ({ session, k: Math.LN10 / STATE_SPACE[session].s, pre: raw.pre, post: raw.ratings });
  return { race: adapt('race', race), qual: adapt('qual', qualifying) };
}
const scenarios = { default: {}, 'persistent-fit': { sdInt: { race: 15, qual: 5.4 }, rhoInt: 0.95 } };
const records = [];
for (const [scenario, overrides] of Object.entries(scenarios)) {
  const params = worldParamsV2(worldFromHyper, {}, overrides);
  for (const seed of [1, 2, 3]) {
    const world = bothSessions(env.timeline, originalIndex, params, seed);
    const idx = indexTimeline(world.timeline, env.prep.ctx), moves = findMoves(idx);
    const runs = { original: rankingCandidates.control({ ...env, timeline: world.timeline }), selected: selected(world.timeline) };
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
}
const metrics = ['driverRmse', 'carRmse', 'teammateGapRmse', 'fieldGapRmse', 'winterLeak', 'seasonLeak', 'carCapture', 'moverStepRmse'];
const summary = {};
for (const scenario of Object.keys(scenarios)) for (const session of ['race', 'qual']) {
  const key = `${scenario}.${session}`;
  summary[key] = Object.fromEntries(metrics.map((metric) => {
    const original = records.filter((row) => row.scenario === scenario && row.session === session && row.model === 'original').map((row) => row[metric]);
    const selected = records.filter((row) => row.scenario === scenario && row.session === session && row.model === 'selected').map((row) => row[metric]);
    const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    return [metric, { original: average(original), selected: average(selected), difference: average(selected.map((value, index) => value - original[index])) }];
  }));
}
await writeFile('research/simplification/selected-simulation-results.json', `${JSON.stringify({
  protocol: 'Simulator v2 on the real calendar through 2015, both sessions generated; three paired seeds per scenario. Retrospective stress tests, not real-world validation. Recovery begins after two initial seasons. Error bars are not evaluated.',
  scenarios, seeds: [1, 2, 3], summary, records,
}, null, 2)}\n`);
