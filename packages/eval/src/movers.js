// Property 1: a driver who changes team keeps his rating.
//
// For every established driver (non-rookie) who moved, we look at
//   step    the change of his rating from his last race for the old team to his k-th race for the new one, net of how
//           stable drivers (same team, same lineup) moved over the same weekends (grid turnover shifts the centring);
//           the interesting numbers are its mean (bias) and its size against the same quantity for stable drivers;
//   leak    the slope of that step on the car-strength difference between the new and the old team: a rating that
//           inherits the car goes up when a driver moves to a faster car, and the slope shows it (0 = clean);
//   frozen  how well his rating from before the move, frozen, predicts his duels against the new teammate, against
//           the same frozen forecast for teammates who stayed (calibration slope 1 = right, less = over-confident).
import { clusterBootstrap, logisticCalibration, mean, meanAbs, nll, ols, rms } from './stats.js';
import { carCidAt, driverPost, makeControls } from './events.js';

const byYear = (it) => it.year;

export const STEP_HORIZONS = [1, 3, 5, 10];
export const GAP_HORIZONS = [5, 10];

/** Step items of one horizon: { year, delta, carCtx, ctlRms, winter }. */
export function stepItems(idx, run, moves, K, controls) {
  const items = [];
  for (const ev of moves) {
    if (!ev.valid || ev.stint < K) continue;
    const tK = ev.apps[K - 1].i;
    const a = driverPost(run, ev.ell, ev.driverId);
    const b = driverPost(run, tK, ev.driverId);
    const ctl = controls.drivers(ev.ell, tK);
    if (!ctl || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    const carNew = run.pre[ev.t0].cars.get(ev.to.cid);
    const oldCid = carCidAt(idx, ev.t0, ev.from.car);
    const carOld = oldCid === undefined ? NaN : run.pre[ev.t0].cars.get(oldCid);
    items.push({
      year: ev.year,
      delta: b - a - ctl.mean,
      carCtx: carNew - carOld,
      ctlRms: ctl.rms,
      winter: ev.winter,
      driverId: ev.driverId,
      t0: ev.t0,
    });
  }
  return items;
}

/** Duel items of movers: first K weekends against teammates, ratings frozen at the first weekend for the new team. */
export function moverDuels(idx, run, moves, K) {
  const out = [];
  for (const ev of moves) {
    if (!ev.valid) continue;
    const pre = run.pre[ev.t0];
    const d = ev.driverId;
    ev.apps.slice(0, K).forEach((app) => {
      idx.timeline[app.i].obs[run.session].forEach((ob, q) => {
        if (!ob.same || (ob.x !== d && ob.y !== d)) return;
        const sign = ob.x === d ? 1 : -1;
        const mate = sign > 0 ? ob.y : ob.x;
        const gap = pre.drivers.get(d) - pre.drivers.get(mate);
        if (!Number.isFinite(gap)) return;
        // from the mover's side: gap = mover minus teammate, outcome = the mover was ahead, online forecast flipped to match
        out.push({ year: ev.year, z: run.k * gap, o: sign > 0 ? ob.o : 1 - ob.o, w: ob.w, zOn: sign * run.z[app.i].adj[q] });
      });
    });
  }
  return out;
}

/** The same frozen forecast for teammates who stayed: ratings from j weekends before (j cycling over 0..K-1), tenure at least `minTenure`. */
export function stayerDuels(idx, run, K, minTenure = 10) {
  const out = [];
  idx.timeline.forEach((w, t) => {
    const f = t - (t % K);
    if (f < 0) return;
    w.obs[run.session].forEach((ob, q) => {
      if (!ob.same) return;
      const tx = idx.tenure[f].get(ob.x);
      const ty = idx.tenure[f].get(ob.y);
      if (!(tx >= minTenure && ty >= minTenure)) return;
      if (idx.teamAt[f].get(ob.x) !== idx.teamAt[t].get(ob.x) || idx.teamAt[f].get(ob.y) !== idx.teamAt[t].get(ob.y)) return;
      const gap = run.pre[f].drivers.get(ob.x) - run.pre[f].drivers.get(ob.y);
      if (!Number.isFinite(gap)) return;
      out.push({ year: w.year, z: run.k * gap, o: ob.o, w: ob.w, zOn: run.z[t].adj[q] });
    });
  });
  return out;
}

const calib = (items) =>
  logisticCalibration(
    items.map((r) => r.z),
    items.map((r) => r.o),
    items.map((r) => r.w),
    { intercept: false },
  ).b;
const lossOf = (items, f) => {
  let s = 0;
  let w = 0;
  for (const r of items) {
    s += r.w * nll(f(r), r.o);
    w += r.w;
  }
  return w ? s / w : NaN;
};

/**
 * @param {object} idx
 * @param {object} run       rating run of one session
 * @param {object[]} moves   findMoves(idx)
 * @param {{ calib?: number, boot?: object }} [o]  calib: the run's calibration multiplier (for the online loss)
 */
export function moverMetrics(idx, run, moves, { calib: c = 1, boot = {} } = {}) {
  const controls = makeControls(idx, run);
  const out = { n: moves.filter((m) => m.valid).length, nAll: moves.length, step: {}, gap: {}, headline: {} };
  const H = out.headline;
  const pre = `movers.${run.session}`;
  for (const K of STEP_HORIZONS) {
    const items = stepItems(idx, run, moves, K, controls);
    const meanCI = clusterBootstrap(items, byYear, (xs) => mean(xs.map((x) => x.delta)), boot);
    const ratioCI = clusterBootstrap(
      items,
      byYear,
      (xs) => Math.sqrt(mean(xs.map((x) => x.delta ** 2))) / Math.sqrt(mean(xs.map((x) => x.ctlRms ** 2))),
      boot,
    );
    const leakCI = clusterBootstrap(
      items.filter((x) => Number.isFinite(x.carCtx)),
      byYear,
      (xs) =>
        ols(
          xs.map((x) => x.carCtx),
          xs.map((x) => x.delta),
        ).b,
      boot,
    );
    out.step[K] = {
      n: items.length,
      mean: meanCI,
      rms: rms(items.map((x) => x.delta)),
      meanAbs: meanAbs(items.map((x) => x.delta)),
      controlRms: Math.sqrt(mean(items.map((x) => x.ctlRms ** 2))),
      rmsRatio: ratioCI,
      leak: leakCI,
    };
    H[`${pre}.step.k${K}.mean`] = meanCI;
    H[`${pre}.step.k${K}.rmsRatio`] = ratioCI;
    H[`${pre}.leak.k${K}`] = leakCI;
  }
  for (const K of GAP_HORIZONS) {
    const mv = moverDuels(idx, run, moves, K);
    const st = stayerDuels(idx, run, K);
    const slopeMv = clusterBootstrap(mv, byYear, calib, boot);
    const slopeSt = clusterBootstrap(st, byYear, calib, boot);
    const cSt = slopeSt.est;
    out.gap[K] = {
      nMovers: mv.length,
      nStayers: st.length,
      slopeMovers: slopeMv,
      slopeStayers: slopeSt,
      // movers' duels: frozen ratings with the stayers' slope, the filter's own forecast, and a coin flip
      lossFrozen: lossOf(mv, (r) => cSt * r.z),
      lossOnline: lossOf(mv, (r) => c * r.zOn),
      lossCoin: Math.LN2,
      lossFrozenStayers: lossOf(st, (r) => cSt * r.z),
    };
    H[`${pre}.frozenSlope.k${K}`] = slopeMv;
    H[`${pre}.frozenSlopeStayers.k${K}`] = slopeSt;
    H[`${pre}.frozenLoss.k${K}`] = { est: out.gap[K].lossFrozen };
    H[`${pre}.onlineLoss.k${K}`] = { est: out.gap[K].lossOnline };
  }
  return out;
}
