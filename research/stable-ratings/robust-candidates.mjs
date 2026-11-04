// Bounded-influence family declared before the third evaluation.
import { staticGraphExam as teammateGraphExam } from '../temporal-graph/static-graph-exam.mjs';
import { rankingCandidates } from '../simplification/candidates-ranking.mjs';
import { persistentSession, withRaw } from './persistent-candidates.mjs';

export function buildRobustCandidates(env) {
  const baseline = rankingCandidates['without-qualifying-car-link'](env);
  const weekends = env.timeline.map((item) => {
    const weekend = env.prep.weekends[item.i];
    if (String(weekend.info.raceId) !== item.raceId) throw Error(`Weekend mismatch: ${item.raceId}`);
    return weekend;
  });
  const graphs = new Map([3, 8].map((halfLifeYears) => [halfLifeYears, teammateGraphExam(weekends, { halfLifeYears })]));
  const make = (graph, share, scale) => ({
    race: persistentSession(env.timeline, baseline.race, graph, 0.75, share, scale),
    qual: persistentSession(env.timeline, baseline.qual, graph, 0.75, share, scale),
  });
  const result = { baseline: {
    race: withRaw(baseline.race),
    qual: withRaw(baseline.qual),
  } };
  for (const scale of [4, 8]) {
    result[`robust-c${scale}-g0`] = make(null, 0, scale);
    for (const halfLife of [3, 8]) result[`robust-c${scale}-g0.05-h${halfLife}`] = make(graphs.get(halfLife), 0.05, scale);
  }
  return result;
}
