// Fixed dated-graph and move-variance comparison; see protocol.md.
import { teammateGraphExam } from '../../packages/core/src/teammate-graph-exam.js';
import { rankingCandidates, temperedHybridCandidate } from '../simplification/candidates-ranking.mjs';
import { mixGraph } from '../stable-ratings/tempered-candidates.mjs';
import { withRaw } from '../stable-ratings/persistent-candidates.mjs';
import { createTeammateGraph as createStaticGraph } from './static-teammate-graph.mjs';
import { createTemporalTeammateGraph } from './temporal-teammate-graph.mjs';

export function buildTemporalCandidates(env) {
  const weekends = env.prep.weekends.slice(0, env.timeline.length);
  const previousGraph = teammateGraphExam(weekends, { halfLifeYears: 3, createGraph: createStaticGraph });
  const temporal = createTemporalTeammateGraph({ halfLifeYears: 3, annualDriftPoints: 4 });
  const graph = weekends.map((weekend, index) => temporal.advance(weekend.info.date,
    weekend.rows.map((row) => String(row.driverId)), previousGraph[index].observations));
  const baseline = rankingCandidates['without-qualifying-car-link'](env);
  const previous = temperedHybridCandidate(env, 0.25);
  const neutral = temperedHybridCandidate(env, 0.25, false);
  const plain = (runs) => Object.fromEntries(['race', 'qual'].map((session) => [session, withRaw(runs[session])]));
  const blend = (runs, evidence) => Object.fromEntries(['race', 'qual'].map((session) =>
    [session, mixGraph(env.timeline, runs[session], evidence, 0.05)]));
  return {
    baseline: plain(baseline),
    'tempered-t0.25-g0': plain(previous),
    'previous-static': blend(previous, previousGraph),
    'neutral-g0': plain(neutral),
    'neutral-static': blend(neutral, previousGraph),
    'current-temporal': blend(previous, graph),
    'neutral-temporal': blend(neutral, graph),
  };
}
