// Intrinsic learning-rate family declared before its chronological evaluation.
import { staticGraphExam as teammateGraphExam } from '../temporal-graph/static-graph-exam.mjs';
import { rankingCandidates, temperedHybridCandidate } from '../simplification/candidates-ranking.mjs';
import { withRaw } from './persistent-candidates.mjs';

const center = (values) => {
  const average = [...values.values()].reduce((sum, value) => sum + value, 0) / (values.size || 1);
  return new Map([...values].map(([id, value]) => [id, value - average]));
};

export function mixGraph(timeline, base, graph, share) {
  const pre = [], post = [], z = [];
  for (const [index, weekend] of timeline.entries()) {
    const old = base.pre[index];
    const graphPre = center(new Map([...old.rated.keys()].map((id) => [id, graph[index].pre.levels.get(id) ?? 0])));
    const delta = (id) => share * (graphPre.get(id) - old.rated.get(id));
    pre.push({ ...old,
      rated: center(new Map([...old.rated].map(([id, value]) => [id, value + delta(id)]))),
      drivers: center(new Map([...old.drivers].map(([id, value]) => [id, value + delta(id)]))),
    });
    const originalPost = base.post[index];
    const ids = [...originalPost.drivers.keys()];
    const graphPost = center(new Map(ids.map((id) => {
      const value = graph[index].post.levels.get(id);
      if (!Number.isFinite(value)) throw Error(`Missing or invalid graph level for ${id} at ${weekend.raceId}`);
      return [id, value];
    })));
    const means = center(new Map(ids.map((id) => {
      const value = originalPost.drivers.get(id).m;
      return [id, value + share * (graphPost.get(id) - value)];
    })));
    post.push({ ...originalPost, drivers: new Map(ids.map((id) => [id, { ...originalPost.drivers.get(id), m: means.get(id) }])) });
    const plain = Float64Array.from(base.z[index].plain, (value, j) => {
      const observation = weekend.obs[base.session][j];
      return value + base.k * (delta(observation.x) - delta(observation.y));
    });
    const vari = base.z[index].vari;
    z.push({ plain, vari, adj: Float64Array.from(plain, (value, j) => value / Math.sqrt(1 + Math.PI / 8 * base.k ** 2 * vari[j])) });
  }
  return withRaw(base, pre, post, z);
}

export function buildTemperedCandidates(env) {
  const baseline = rankingCandidates['without-qualifying-car-link'](env);
  const weekends = env.timeline.map((item) => {
    const weekend = env.prep.weekends[item.i];
    if (String(weekend.info.raceId) !== item.raceId) throw Error(`Weekend mismatch: ${item.raceId}`);
    return weekend;
  });
  const graph = teammateGraphExam(weekends, { halfLifeYears: 3 });
  const result = { baseline: { race: withRaw(baseline.race), qual: withRaw(baseline.qual) } };
  for (const temperature of [0.5, 0.25]) {
    const fast = temperedHybridCandidate(env, temperature);
    result[`tempered-t${temperature}-g0`] = { race: withRaw(fast.race), qual: withRaw(fast.qual) };
    result[`tempered-t${temperature}-g0.05-h3`] = {
      race: mixGraph(env.timeline, fast.race, graph, 0.05),
      qual: mixGraph(env.timeline, fast.qual, graph, 0.05),
    };
  }
  return result;
}
