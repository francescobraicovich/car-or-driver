// Compare portable truth recovery in paired Simulator v2 worlds. Both sessions
// are synthetic, and the published hybrid consumes the synthetic observations.
import { load } from '../../packages/research/node/strict-eval.mjs';
import { bothSessions } from '../../packages/research/node/simulation-both.mjs';
import { indexTimeline, findMoves, truthMetrics, worldFromHyper, worldParamsV2 } from '../../packages/eval/src/index.js';
import { runSession, carLineage } from '../../packages/core/src/state-space/build.js';
import { hybridRatings } from '../../packages/core/src/hybrid/ratings.js';
import { STATE_SPACE } from '../../packages/core/src/presets/state-space.js';
import { candidates } from './candidates.mjs';

const name = process.argv[2];
if (!name || !candidates[name]) throw Error('Supply a candidate name');
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
function published(timeline) {
  const weekends = env.prep.weekends.slice(0, timeline.length).map((weekend, i) => ({
    ...weekend, raceObs: timeline[i].obs.race, qualObs: timeline[i].obs.qual,
  }));
  const qualifying = runSession(weekends, 'qual', env.prep.ctx.tmBoost);
  const race = hybridRatings(weekends, runSession(weekends, 'race', env.prep.ctx.tmBoost, qualifying), qualifying, carLineage);
  const adapt = (session, raw) => ({ session, k: Math.LN10 / STATE_SPACE[session].s, pre: raw.pre, post: raw.ratings });
  return { race: adapt('race', race), qual: adapt('qual', qualifying) };
}
const scenarios = { default: {}, 'persistent-fit': { sdInt: { race: 15, qual: 5.4 }, rhoInt: 0.95 } };
for (const [scenario, overrides] of Object.entries(scenarios)) {
  const params = worldParamsV2(worldFromHyper, {}, overrides);
  for (const seed of [1, 2, 3]) {
    const world = bothSessions(env.timeline, originalIndex, params, seed);
    const idx = indexTimeline(world.timeline, env.prep.ctx), moves = findMoves(idx);
    const runs = { published: published(world.timeline), candidate: candidates[name]({ ...env, timeline: world.timeline }) };
    for (const [model, pair] of Object.entries(runs)) for (const session of ['race', 'qual']) {
      const run = { ...pair[session], post: pair[session].post.map(center) };
      const result = truthMetrics(idx, run, { truth: session === 'race' ? world.truth : world.truthQual }, { boot: { B: 0 }, moves });
      console.log(JSON.stringify({ scenario, seed, model, session, driverRmse: result.rmseDriver.est, carRmse: result.rmseCar.est,
        teammateGapRmse: result.gapRmse.mates.est, fieldGapRmse: result.gapRmse.cars.est,
        winterLeak: result.leakTruth.winterUnchanged.est, seasonLeak: result.leakTruth.season.est,
        carCapture: result.carCapture.est, moverStepRmse: result.moverStepError.rms }));
    }
  }
}
