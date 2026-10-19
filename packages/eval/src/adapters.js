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
import { arrivalOffsets, qualLink } from '../../core/src/state-space/qualifying-link.js';

const logit = (p) => Math.log(Math.min(1 - 1e-12, Math.max(1e-12, p)) / (1 - Math.min(1 - 1e-12, Math.max(1e-12, p))));

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
    if (link.beta || link.gamma) {
      const q = runStateSpace(weekends('qual'), { ...STATE_SPACE_DEFAULTS, ...STATE_SPACE.qual }, ctx);
      ctx = { ...ctx, ...qualLink(q, link.beta, link.gamma) };
    }
    if (STATE_SPACE.adapt?.dip) ctx = { ...ctx, adapt: arrivalOffsets(timeline, ctx.canon, STATE_SPACE.adapt) };
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

/**
 * The Elo-style ratings of the benchmark pass, as a rating run.
 * @param {object[]} timeline
 * @param {object[]} weekends   collectExamWithElo(...).weekends (carry the Elo levels before each weekend)
 * @param {object[]} snaps      collectExamWithElo(...).elo.snaps (Elo ratings after each weekend)
 * @param {'race'|'qual'} session
 * @param {number} [scale]      the Elo scale of the likelihood (rating points per factor ten in odds)
 */
export function eloRun(timeline, weekends, snaps, session, scale = 75) {
  const field = session === 'race' ? 'race' : 'qual';
  const strKeys = (m) => new Map([...m].map(([id, v]) => [String(id), v]));
  const post = snaps.map((s) => ({
    drivers: new Map(s.drivers.map((d) => [String(d.driverId), { m: d[field], sd: null, seen: true }])),
    cars: new Map(s.cars.map((c) => [String(c.constructorId), { m: c[field], sd: null }])),
  }));
  const pre = weekends.map((w) => ({
    drivers: strKeys(session === 'race' ? w.eloD : w.eloQD),
    cars: strKeys(session === 'race' ? w.eloC : w.eloQC),
  }));
  const z = timeline.map((w) => {
    const plain = Float64Array.from(w.obs[session], (o) => logit(o.pElo));
    return { plain, adj: plain, vari: null };
  });
  return { name: 'elo', session, k: Math.LN10 / scale, post, pre, z, drift: null };
}
