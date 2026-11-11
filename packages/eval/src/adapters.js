// Adapters from a model to the harness's common shape, a "rating run" for one session:
//
//   {
//     name, session,
//     k,       // log-odds per rating point (ln 10 / s)
//     post,    // per weekend: { drivers: Map<driverId, { m, sd|null, seen? }>, cars: Map<constructorId, { m, sd|null }> }
//              //   ratings after the weekend, centred on that weekend's field when the model does so
//     pre,     // per weekend: { drivers: Map<driverId, number>, cars: Map<constructorId, number> }
//              //   levels as forecast BEFORE the weekend (look-ahead free); only differences within one weekend mean anything
//     z,       // per weekend: { plain: Float64Array, adj: Float64Array, vari: Float64Array|null }
//              //   raw log-odds that the first driver of each observation beats the second (before any calibration
//              //   multiplier): `adj` carries the model's own uncertainty, `vari` is the variance of the gap in points
//     drift,   // { driver, car } per-weekend variance added by the time update, for the uncertainty tests (or null)
//     raw,     // optional: whatever the model returned, for callers that need more
//   }
//
// Any model that can fill this shape plugs into every metric of the harness.
import { runStateSpace, STATE_SPACE_DEFAULTS } from '../../core/src/state-space/filter.js';
import { STATE_SPACE } from '../../core/src/presets/state-space.js';
import { qualLink } from '../../core/src/state-space/qualifying-link.js';

/**
 * The joint state-space filter on a timeline.
 * @param {object[]} timeline
 * @param {'race'|'qual'} session
 * @param {object} ctx      { canon, carOf, tmBoost }
 * @param {object} [hyper]  overrides of the shipped settings of that session
 */
export function stateSpaceRun(timeline, session, ctx, hyper = {}, name = 'state-space') {
  const h = { ...STATE_SPACE_DEFAULTS, ...STATE_SPACE[session], ...hyper };
  const weekends = (sess) => timeline.map((w) => ({ year: w.year, rows: w.rows, obs: w.obs[sess], wet: w.wet }));
  // `ctx.linkShipped`: the race filter reads the qualifying filter at the shipped settings through STATE_SPACE.link (state-space/qualifying-link.js), as the build does.
  // Without it (the default) the filter runs alone, which is what the earlier climbs and the baseline of `separation-report.mjs` mean.
  if (ctx.linkShipped && session === 'race' && !ctx.offsets) {
    const link = STATE_SPACE.link ?? {};
    if (link.beta) {
      const q = runStateSpace(weekends('qual'), { ...STATE_SPACE_DEFAULTS, ...STATE_SPACE.qual }, ctx);
      ctx = { ...ctx, ...qualLink(q, link.beta) };
    }
  }
  const out = runStateSpace(weekends(session), h, ctx);
  const k = Math.LN10 / h.s;
  return {
    name,
    session,
    k,
    hyper: out.hyper,
    post: out.ratings,
    pre: out.pre,
    z: out.predictions.map((p) => {
      const plain = Float64Array.from(p.mean, (v) => k * v);
      const adj = Float64Array.from(p.mean, (v, q) => (k * v) / Math.sqrt(1 + (Math.PI / 8) * k * k * p.vari[q]));
      return { plain, adj, vari: p.vari };
    }),
    drift: { driver: h.raceD ** 2, car: h.raceC ** 2 },
    raw: out, // the filter's own output, for the forecast layer (finishStateSpace)
  };
}
