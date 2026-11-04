// Persistent portable driver levels, declared separately from the first family.
import { staticGraphExam as teammateGraphExam } from '../temporal-graph/static-graph-exam.mjs';
import { rankingCandidates } from '../simplification/candidates-ranking.mjs';

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
const center = (values) => {
  const average = mean([...values.values()]);
  return new Map([...values].map(([id, value]) => [id, value - average]));
};
const centerPost = (values) => {
  const centered = center(new Map([...values].map(([id, value]) => [id, value.m])));
  return new Map([...values].map(([id, value]) => [id, { ...value, m: centered.get(id) }]));
};

export function persistentSession(timeline, base, graph, alpha, graphShare, innovationScale = Infinity) {
  const levels = new Map();
  const pre = [], post = [], z = [];
  for (const [i, weekend] of timeline.entries()) {
    const old = base.pre[i];
    const returning = [...old.rated.keys()].filter((id) => levels.has(id));
    // Anchor entrants to the field members whose persistent levels already exist.
    const offset = mean(returning.map((id) => levels.get(id) - old.rated.get(id)));
    for (const [id, value] of old.rated) if (!levels.has(id)) levels.set(id, value + offset);
    const driverDelta = (id) => levels.get(id) - old.rated.get(id);
    const rated = center(new Map([...old.rated.keys()].map((id) => [id, levels.get(id)])));
    const drivers = center(new Map([...old.drivers].map(([id, value]) => [id, value + driverDelta(id)])));
    pre.push({ ...old, rated, drivers });
    const plain = Float64Array.from(base.z[i].plain, (value, j) => {
      const observation = weekend.obs[base.session][j];
      return value + base.k * (driverDelta(observation.x) - driverDelta(observation.y));
    });
    const vari = base.z[i].vari;
    z.push({ plain, vari, adj: Float64Array.from(plain, (value, j) => value / Math.sqrt(1 + Math.PI / 8 * base.k ** 2 * vari[j])) });

    const originalPost = base.post[i];
    const ids = [...originalPost.drivers.keys()];
    const reference = mean(ids.map((id) => levels.get(id)));
    const baselineMean = mean(ids.map((id) => originalPost.drivers.get(id).m));
    const graphLevels = graph ? ids.map((id) => {
      const value = graph[i].post.levels.get(id);
      if (!Number.isFinite(value)) throw Error(`Missing or invalid graph level for ${id} at ${weekend.raceId ?? i}`);
      return value;
    }) : [];
    const graphMean = mean(graphLevels);
    if (weekend.obs.race.length || weekend.obs.qual.length) {
      const innovations = ids.map((id, index) => {
        const baselineTarget = originalPost.drivers.get(id).m - baselineMean + reference;
        const graphTarget = graph ? graphLevels[index] - graphMean + reference : baselineTarget;
        const target = baselineTarget + graphShare * (graphTarget - baselineTarget);
        const innovation = target - levels.get(id);
        return Number.isFinite(innovationScale) ? innovationScale * Math.tanh(innovation / innovationScale) : innovation;
      });
      const gauge = Number.isFinite(innovationScale) ? mean(innovations) : 0;
      for (const [index, id] of ids.entries()) levels.set(id, levels.get(id) + alpha * (innovations[index] - gauge));
    }
    post.push({
      ...originalPost,
      drivers: centerPost(new Map(ids.map((id) => [id, { ...originalPost.drivers.get(id), m: levels.get(id) }]))),
    });
  }
  return withRaw(base, pre, post, z);
}

export function withRaw(base, pre = base.pre, post = base.post, z = base.z) {
  const oldRaw = base.raw;
  const predictions = z.map((values, i) => ({ ...oldRaw.predictions[i], mean: Float64Array.from(values.plain, (value) => value / base.k) }));
  const latest = oldRaw.latest ? { ...oldRaw.latest, mean: Float64Array.from(oldRaw.latest.mean, (value, position) => {
    const count = oldRaw.latest.driverIds.length;
    const kind = position < count ? 'drivers' : 'cars';
    const id = position < count ? oldRaw.latest.driverIds[position] : oldRaw.latest.carIds[position - count];
    const before = oldRaw.ratings.at(-1)[kind].get(id)?.m;
    const after = post.at(-1)[kind].get(id)?.m;
    return value + (Number.isFinite(before) && Number.isFinite(after) ? after - before : 0);
  }) } : null;
  return { ...base, pre, post, z, raw: { ...oldRaw, pre, ratings: post, predictions, latest } };
}

export function buildPersistentCandidates(env) {
  const baseline = rankingCandidates['without-qualifying-car-link'](env);
  const weekends = env.timeline.map((item) => {
    const weekend = env.prep.weekends[item.i];
    if (String(weekend.info.raceId) !== item.raceId) throw Error(`Weekend mismatch: ${item.raceId}`);
    return weekend;
  });
  const graphs = new Map([3, 8].map((halfLifeYears) => [halfLifeYears, teammateGraphExam(weekends, { halfLifeYears })]));
  const result = { baseline: { race: withRaw(baseline.race), qual: withRaw(baseline.qual) } };
  for (const alpha of [0.25, 0.125]) {
    const construct = (graph, share) => ({
      race: persistentSession(env.timeline, baseline.race, graph, alpha, share),
      qual: persistentSession(env.timeline, baseline.qual, graph, alpha, share),
    });
    result[`persistent-a${alpha}-g0`] = construct(null, 0);
    for (const share of [0.05, 0.15]) for (const halfLife of [3, 8]) {
      result[`persistent-a${alpha}-g${share}-h${halfLife}`] = construct(graphs.get(halfLife), share);
    }
  }
  return result;
}
