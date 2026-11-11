import { writeFile } from 'node:fs/promises';
import { load } from '../../packages/research/node/strict-eval.mjs';
import { bothSessions } from '../../packages/research/node/simulation-both.mjs';
import { indexTimeline, findMoves, truthMetrics, worldFromHyper, worldParamsV2 } from '../../packages/eval/src/index.js';
import { carLineage } from '../../packages/core/src/state-space/build.js';
import { modelSourceHash } from '../../tools/model-source-hash.mjs';
import { simulatedWeekends } from '../stable-ratings/synthetic-weekends.mjs';
import { experimentRuns } from './comparison.mjs';
import { experimentFingerprint } from './fingerprint.mjs';

const fingerprint = await experimentFingerprint();
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
for (const [scenario, overrides] of Object.entries(scenarios))
  for (const seed of [1, 2, 3]) {
    const world = bothSessions(env.timeline, originalIndex, worldParamsV2(worldFromHyper, {}, overrides), seed);
    const idx = indexTimeline(world.timeline, env.prep.ctx),
      moves = findMoves(idx);
    const runs = experimentRuns(world.timeline, simulatedWeekends(world.timeline), env.prep.ctx);
    const shared = Object.fromEntries(
      ['race', 'qual'].map((session) => [
        session,
        runs.published[session].post.map(
          (snapshot, i) =>
            new Set(
              [...snapshot.drivers]
                .filter(
                  ([id, value]) =>
                    value.seen !== false &&
                    Object.values(runs).every((model) => {
                      const rating = model[session].post[i].drivers.get(id);
                      return rating && rating.seen !== false;
                    }),
                )
                .map(([id]) => id),
            ),
        ),
      ]),
    );
    for (const [name, pair] of Object.entries(runs))
      for (const session of ['race', 'qual']) {
        const run = {
          ...pair[session],
          post: pair[session].post.map((snapshot, i) => {
            const value = center(snapshot);
            return {
              ...value,
              drivers: new Map([...value.drivers].map(([id, rating]) => [id, { ...rating, seen: shared[session][i].has(id) }])),
            };
          }),
        };
        const result = truthMetrics(idx, run, { truth: session === 'race' ? world.truth : world.truthQual }, { boot: { B: 0 }, moves });
        records.push({
          scenario,
          seed,
          model: name,
          session,
          driverCount: result.rmseDriver.n,
          carCount: result.rmseCar.n,
          teammateGapCount: result.gapRmse.mates.n,
          fieldGapCount: result.gapRmse.cars.n,
          driverRmse: result.rmseDriver.est,
          carRmse: result.rmseCar.est,
          teammateGapRmse: result.gapRmse.mates.est,
          fieldGapRmse: result.gapRmse.cars.est,
          winterLeak: result.leakTruth.winterUnchanged.est,
          seasonLeak: result.leakTruth.season.est,
          carCapture: result.carCapture.est,
          moverStepRmse: result.moverStepError.rms,
        });
      }
    console.log(`Completed ${scenario}, seed ${seed}`);
  }
const models = [...new Set(records.map((row) => row.model))];
for (const scenario of Object.keys(scenarios))
  for (const seed of [1, 2, 3])
    for (const session of ['race', 'qual']) {
      const rows = records.filter((row) => row.scenario === scenario && row.seed === seed && row.session === session);
      for (const key of ['driverCount', 'carCount', 'teammateGapCount', 'fieldGapCount']) {
        if (rows.length !== models.length || new Set(rows.map((row) => row[key])).size !== 1)
          throw Error(`Simulation ${key} coverage differs`);
      }
    }
const metrics = ['driverRmse', 'carRmse', 'teammateGapRmse', 'fieldGapRmse', 'winterLeak', 'seasonLeak', 'carCapture', 'moverStepRmse'];
const summary = {};
for (const scenario of Object.keys(scenarios))
  for (const session of ['race', 'qual']) {
    summary[`${scenario}.${session}`] = Object.fromEntries(
      metrics.map((metric) => [
        metric,
        Object.fromEntries(
          models.map((model) => {
            const values = records
              .filter((row) => row.scenario === scenario && row.session === session && row.model === model)
              .map((row) => row[metric]);
            return [model, values.reduce((sum, value) => sum + value, 0) / values.length];
          }),
        ),
      ]),
    );
  }
if ((await experimentFingerprint()) !== fingerprint) throw Error('Sources changed during simulation');
await writeFile(
  'research/graph-car-ratings/midpoint-simulation-results.json',
  `${JSON.stringify(
    {
      fingerprint,
      modelSource: await modelSourceHash(),
      protocol: 'research/graph-car-ratings/README.md',
      scenarios,
      seeds: [1, 2, 3],
      summary,
      records,
    },
    null,
    2,
  )}\n`,
);
console.log('Wrote research/graph-car-ratings/midpoint-simulation-results.json');
