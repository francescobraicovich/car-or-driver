// Drivers in a new car, scored with the rating as it was POSTED before the move.
//
// The harness's own frozen test (movers.js) reads the mover's level at his first weekend for the new team, after the filter has already reset the
// old team's fit term for him: a step only movers take. Here the prior rating of a mover is read BEFORE his last weekend for the old team (the rating a
// reader of the ratings had; `pre[ell].rated`, which excludes the driver-team fit when `rateA` is off) and nothing at or after the move is used for him.
//
//   teammates  duels against his new teammate in his first K weekends: gap = rated(mover, ell) - rated(mate, ell)  (the mate's rating at the same weekend,
//              both centred on that weekend's field; duels where the mate was not racing at ell are dropped for every model alike)
//   field      duels against drivers of other teams in his first K weekends: gap = [rated(mover, ell) - field mean at ell] + C_new(t) - ([D_o(t) - field mean at t] + C_o(t)),
//              the new car and the opponent as the run forecast them before that weekend t
//
// Loss uses the model's own calibration multiplier (fitted on 2002-2007 on non-mover cross-team pairs), teammates also the stayers' slope as in the harness.
import { indexTimeline, findMoves, logisticCalibration, nll, clusterBootstrap, mean } from '../../eval/src/index.js';

const meanOf = (m) => {
  let s = 0;
  let n = 0;
  for (const v of m.values())
    if (Number.isFinite(v)) {
      s += v;
      n++;
    }
  return n ? s / n : NaN;
};
const calib = (items, key = 'z') =>
  logisticCalibration(
    items.map((r) => r[key]),
    items.map((r) => r.o),
    items.map((r) => r.w),
    { intercept: false },
  ).b;
export const lossOf = (items, f) => {
  let s = 0;
  let w = 0;
  for (const r of items) {
    s += r.w * nll(f(r), r.o);
    w += r.w;
  }
  return w ? s / w : NaN;
};

/** Duel items of movers for K first weekends: { year, t0, driverId, tm: {z,o,w}[], fd: {z,o,w}[] } flattened with a `kind` field. */
export function strictItems(idx, run, moves, K, adapt = null) {
  const out = [];
  const k = run.k;
  const ad = (t, id) => (adapt?.[t] ? (adapt[t].get(String(id)) ?? 0) : 0); // known arrival adaptation, points (<= 0)
  for (const ev of moves) {
    if (!ev.valid) continue;
    const d = ev.driverId;
    const preE = run.pre[ev.ell];
    if (!preE?.rated?.has(d)) continue;
    const mE = meanOf(preE.rated);
    const dM = preE.rated.get(d) - mE;
    ev.apps.slice(0, K).forEach((app) => {
      const t = app.i;
      const preT = run.pre[t];
      const mT = meanOf(preT.rated);
      idx.timeline[t].obs[run.session].forEach((ob) => {
        if (ob.x !== d && ob.y !== d) return;
        const sign = ob.x === d ? 1 : -1;
        const other = sign > 0 ? ob.y : ob.x;
        const cM = sign > 0 ? ob.cx : ob.cy;
        const cO = sign > 0 ? ob.cy : ob.cx;
        const o = sign > 0 ? ob.o : 1 - ob.o;
        if (ob.same) {
          const oE = preE.rated.get(other);
          if (!Number.isFinite(oE)) return;
          out.push({ kind: 'tm', year: ev.year, driverId: d, t0: ev.t0, z: k * (dM - (oE - mE) + ad(t, d) - ad(t, other)), o, w: ob.w });
        } else {
          const oT = preT.rated.get(other);
          const carM = preT.cars.get(cM);
          const carO = preT.cars.get(cO);
          if (![oT, carM, carO].every(Number.isFinite)) return;
          out.push({
            kind: 'fd',
            year: ev.year,
            driverId: d,
            t0: ev.t0,
            z: k * (dM + carM - (oT - mT) - carO + ad(t, d) - ad(t, other)),
            o,
            w: ob.w,
          });
        }
      });
    });
  }
  return out;
}

/** Stayers' frozen teammate duels (the harness's reference slope), on the same rated levels, ratings from the start of each K-block. */
export function strictStayers(idx, run, K, minTenure = 10) {
  const out = [];
  idx.timeline.forEach((w, t) => {
    const f = t - (t % K);
    if (f < 0) return;
    const pre = run.pre[f];
    if (!pre?.rated) return;
    w.obs[run.session].forEach((ob) => {
      if (!ob.same) return;
      const tx = idx.tenure[f].get(ob.x);
      const ty = idx.tenure[f].get(ob.y);
      if (!(tx >= minTenure && ty >= minTenure)) return;
      if (idx.teamAt[f].get(ob.x) !== idx.teamAt[t].get(ob.x) || idx.teamAt[f].get(ob.y) !== idx.teamAt[t].get(ob.y)) return;
      const gap = pre.rated.get(ob.x) - pre.rated.get(ob.y);
      if (!Number.isFinite(gap)) return;
      out.push({ year: w.year, z: run.k * gap, o: ob.o, w: ob.w });
    });
  });
  return out;
}

/**
 * Scores of one run: for K in 5 and 10, the strict frozen loss of movers against the new teammate (stayers' slope) and against the field (the run's own
 * multiplier `c`), their calibration slopes, and the number of duels.
 */
export function strictScores(idx, run, c, { moves = findMoves(idx), windows = null, adapt = null } = {}) {
  const res = {};
  for (const K of [5, 10]) {
    const items = strictItems(idx, run, moves, K, adapt);
    const st = strictStayers(idx, run, K);
    const cSt = calib(st);
    for (const [name, y0, y1] of windows ?? [['all', 0, 9999]]) {
      const inW = (r) => r.year >= y0 && r.year <= y1;
      const tm = items.filter((r) => r.kind === 'tm' && inW(r));
      const fd = items.filter((r) => r.kind === 'fd' && inW(r));
      res[`${name}.k${K}`] = {
        nTm: tm.length,
        nFd: fd.length,
        tmLoss: lossOf(tm, (r) => cSt * r.z),
        tmSlope: calib(tm),
        stSlope: calib(st.filter(inW)),
        stLoss: lossOf(st.filter(inW), (r) => cSt * r.z),
        fdLoss: lossOf(fd, (r) => c * r.z),
        fdSlope: calib(fd),
      };
    }
  }
  return res;
}
export { indexTimeline, clusterBootstrap, mean };
