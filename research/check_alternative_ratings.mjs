// Prefix invariance and finite published ratings for the three research models.
import assert from 'node:assert/strict';
import { load } from '../packages/research/node/strict-eval.mjs';
import { componentExposure, continuousPace, discriminativeRanking, teammateNetwork } from './alternative_rating_models.mjs';

const env = await load(2025, true);
const last = env.timeline.slice(-30);
const prefix = last.slice(0, 24);
const carOf = env.prep.ctx.carOf;
const exposure = (timeline) => componentExposure(timeline, env.prep.data.raw.races);
const models = {
  network: (timeline, session) => teammateNetwork(timeline, session, carOf, exposure(timeline)),
  pace: (timeline, session) => continuousPace(timeline, session, env.prep.data, carOf, exposure(timeline)),
  ranking: (timeline, session) => discriminativeRanking(timeline, session, carOf, exposure(timeline)),
};
const serialise = (run) => ({
  pre: run.pre.map((weekend) => ({ drivers: [...weekend.drivers], cars: [...weekend.cars] })),
  post: run.post.map((weekend) => ({ drivers: [...weekend.drivers], cars: [...weekend.cars] })),
  predictions: run.z.map((weekend) => [...weekend.adj]),
});
for (const [name, fit] of Object.entries(models)) {
  for (const session of ['race', 'qual']) {
    const short = fit(prefix, session);
    const long = fit(last, session);
    const expected = serialise(short);
    const actual = serialise({ pre: long.pre.slice(0, 24), post: long.post.slice(0, 24), z: long.z.slice(0, 24) });
    assert.deepEqual(actual, expected, `${name}/${session} looked ahead`);
    for (const weekend of short.post) {
      assert.ok(weekend.drivers.size > 0 && weekend.cars.size > 0);
      for (const rating of [...weekend.drivers.values(), ...weekend.cars.values()]) assert.ok(Number.isFinite(rating.m));
    }
  }
}
console.log('PASS alternative ratings: prefix invariant; driver and car ratings finite in both sessions');
