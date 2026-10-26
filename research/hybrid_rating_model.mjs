// Research-only portable driver and constructor ratings. Each component is a
// forward-only rating run; the blend sees only the components' pre-weekend state.
import { stateSpaceRun } from '../packages/eval/src/index.js';
import { qualLink } from '../packages/core/src/state-space/qualifying-link.js';
import { FINAL } from '../packages/research/node/strict-eval.mjs';
import { componentExposure, discriminativeRanking } from './alternative_rating_models.mjs';
import { jointRatingBlend } from './joint_rating_blend.mjs';

export const HYBRID_OPTIONS = Object.freeze({
  qualifyingDriverShare: 0.4,
  rankingDriverShare: 0.2,
  qualifyingCarShare: 0.25,
  ranking: Object.freeze({ learningRate: 180, teammateWeight: 2, fitPenalty: 0.15,
    levelPenalty: 0.001, carWinterRetention: 0.8, includeComponent: false }),
});

export function buildHybridRatings(timeline, prep, base, options = HYBRID_OPTIONS) {
  const qualifying = stateSpaceRun(timeline, 'qual', prep.ctx, base.qual);
  const baseline = stateSpaceRun(timeline, 'race',
    { ...prep.ctx, ...qualLink(qualifying.raw, FINAL.beta, FINAL.gamma) },
    { ...base.race, ...FINAL.race });
  const exposure = componentExposure(timeline, prep.data.raw.races);
  const ranking = discriminativeRanking(timeline, 'race', prep.ctx.carOf, exposure, options.ranking);
  const first = jointRatingBlend(timeline, baseline, qualifying,
    options.qualifyingDriverShare, options.qualifyingCarShare);
  const hybrid = jointRatingBlend(timeline, first, ranking, options.rankingDriverShare, 0);
  return { qualifying, baseline, ranking, hybrid, exposure };
}
