// Fixed candidate family declared in protocol.md before evaluation.
import { stateSpaceRun } from '../../packages/eval/src/adapters.js';
import { staticGraphExam as teammateGraphExam } from '../temporal-graph/static-graph-exam.mjs';
import { ORIGINAL_FILTER, rankingCandidates } from '../simplification/candidates-ranking.mjs';

const FILTER = {
  race: { ...ORIGINAL_FILTER.race, sdNew: 9, sdC: 27, rho: 0.8, winterC: 9, raceC: 1, yearD: 2, tau: 0.04, thetaT: 2.75, mPace: 25, mPart: 40, sdJ: 0 },
  qual: { ...ORIGINAL_FILTER.qual, sdNew: 34, sdC: 60, winterC: 33, raceC: 6, yearD: 4, tau: 0.07, thetaT: 2.75, sdR: 6.5, sdJ: 0 },
};
const center = (map) => {
  const mean = [...map.values()].reduce((sum, value) => sum + value, 0) / (map.size || 1);
  return new Map([...map].map(([id, value]) => [id, value - mean]));
};
const centerPost = (map) => {
  const means = center(new Map([...map].map(([id, value]) => [id, value.m])));
  return new Map([...map].map(([id, value]) => [id, { ...value, m: means.get(id) }]));
};

// Preserve fit, rookie and other effective-state terms by adding only the
// portable-level correction. Variances/covariances remain filter approximations.
export function blendSession(timeline, session, race, qual, graph, share) {
  const base = session === 'race' ? race : qual;
  const pre = [], post = [], z = [], predictions = [];
  for (const [i, weekend] of timeline.entries()) {
    const old = base.pre[i], q = qual.pre[i];
    const graphValues = graph ? center(new Map([...old.rated.keys()].map((id) => [id, graph[i].pre.levels.get(id) ?? 0]))) : null;
    const driverDelta = (id) => {
      const value = old.rated.get(id);
      const independent = session === 'race' ? value + 0.4 * ((q.rated.get(id) ?? value) - value) : value;
      return independent + share * ((graphValues?.get(id) ?? independent) - independent) - value;
    };
    const carDelta = (id) => session === 'race' ? 0.25 * ((q.cars.get(id) ?? old.cars.get(id)) - old.cars.get(id)) : 0;
    pre.push({ ...old,
      rated: center(new Map([...old.rated].map(([id, value]) => [id, value + driverDelta(id)]))),
      drivers: center(new Map([...old.drivers].map(([id, value]) => [id, value + driverDelta(id)]))),
      cars: center(new Map([...old.cars].map(([id, value]) => [id, value + carDelta(id)]))),
    });
    const oldPost = base.post[i], qPost = qual.post[i];
    const graphPost = graph ? center(new Map([...oldPost.drivers.keys()].map((id) => [id, graph[i].post.levels.get(id) ?? 0]))) : null;
    const drivers = new Map([...oldPost.drivers].map(([id, value]) => {
      const independent = session === 'race' ? value.m + 0.4 * ((qPost.drivers.get(id)?.m ?? value.m) - value.m) : value.m;
      return [id, { ...value, m: independent + share * ((graphPost?.get(id) ?? independent) - independent) }];
    }));
    const cars = new Map([...oldPost.cars].map(([id, value]) => [id, {
      ...value, m: value.m + (session === 'race' ? 0.25 * ((qPost.cars.get(id)?.m ?? value.m) - value.m) : 0),
    }]));
    post.push({ drivers: centerPost(drivers), cars: centerPost(cars) });
    const original = base.raw.predictions[i];
    const mean = Float64Array.from(original.mean, (value, j) => {
      const observation = weekend.obs[session][j];
      return value + driverDelta(observation.x) - driverDelta(observation.y) + carDelta(observation.cx) - carDelta(observation.cy);
    });
    predictions.push({ ...original, mean });
    const plain = Float64Array.from(mean, (value) => base.k * value);
    z.push({ plain, vari: original.vari, adj: Float64Array.from(plain, (value, j) => value / Math.sqrt(1 + Math.PI / 8 * base.k ** 2 * original.vari[j])) });
  }
  return withRaw({ ...base, pre, post, z }, predictions);
}

function withRaw(run, predictions = run.z.map((values, i) => ({ ...run.raw.predictions[i], mean: Float64Array.from(values.plain, (value) => value / run.k) }))) {
  const old = run.raw;
  const latest = old.latest ? { ...old.latest, mean: Float64Array.from(old.latest.mean, (value, position) => {
    const count = old.latest.driverIds.length;
    const kind = position < count ? 'drivers' : 'cars';
    const id = position < count ? old.latest.driverIds[position] : old.latest.carIds[position - count];
    const before = old.ratings.at(-1)[kind].get(id)?.m;
    const after = run.post.at(-1)[kind].get(id)?.m;
    return value + (Number.isFinite(before) && Number.isFinite(after) ? after - before : 0);
  }) } : null;
  return { ...run, raw: { ...old, pre: run.pre, ratings: run.post, predictions, latest } };
}

export function buildStableCandidates(env) {
  const baseline = rankingCandidates['without-qualifying-car-link'](env);
  baseline.race = withRaw(baseline.race);
  const qual = stateSpaceRun(env.timeline, 'qual', env.prep.ctx, FILTER.qual);
  const race = stateSpaceRun(env.timeline, 'race', env.prep.ctx, FILTER.race);
  const weekends = env.timeline.map((item) => {
    const weekend = env.prep.weekends[item.i];
    if (String(weekend.info.raceId) !== item.raceId) throw Error(`Weekend mismatch: ${item.raceId}`);
    return weekend;
  });
  const result = { baseline, 'slow-filters': {
    race: blendSession(env.timeline, 'race', race, qual, null, 0),
    qual: blendSession(env.timeline, 'qual', race, qual, null, 0),
  } };
  for (const halfLife of [3, 8]) {
    const graph = teammateGraphExam(weekends, { halfLifeYears: halfLife });
    for (const share of [0.2, 0.5, 0.8, 1]) {
      result[`graph-${halfLife}-share-${share}`] = {
        race: blendSession(env.timeline, 'race', race, qual, graph, share),
        qual: blendSession(env.timeline, 'qual', race, qual, graph, share),
      };
    }
  }
  return result;
}
