// Diagnosis tools (docs/diagnosis.md): rich duel records for movers and stayers under the strict prior-rating reading, and a logistic regression
// with cluster-robust standard errors. Nothing here changes a model.
import { findMoves } from '../../eval/src/index.js';

export const meanMap = (m) => {
  let s = 0;
  let n = 0;
  for (const v of m.values())
    if (Number.isFinite(v)) {
      s += v;
      n++;
    }
  return n ? s / n : NaN;
};

/** Weighted logistic regression o ~ X b (no intercept unless a constant feature is given), Newton, cluster-robust (sandwich) covariance. */
export function logit(rows, feats, { cluster = null, init = null, ridge = 1e-9 } = {}) {
  const p = feats.length;
  let b = init ?? feats.map((_, i) => (i === 0 ? 1 : 0));
  const X = rows.map((r) => feats.map((f) => f(r)));
  const solve = (A, v) => {
    const n = v.length;
    const M = A.map((r, i) => [...r, v[i]]);
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
      }
    }
    return M.map((r, i) => r[n] / r[i]);
  };
  const inv = (A) => {
    const n = A.length;
    const cols = [];
    for (let j = 0; j < n; j++)
      cols.push(
        solve(
          A,
          Array.from({ length: n }, (_, i) => (i === j ? 1 : 0)),
        ),
      );
    return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => cols[j][i]));
  };
  let H;
  for (let it = 0; it < 40; it++) {
    const g = new Array(p).fill(0);
    H = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => (i === j ? ridge : 0)));
    rows.forEach((r, n) => {
      const s = X[n].reduce((a, v, i) => a + v * b[i], 0);
      const pr = 1 / (1 + Math.exp(-s));
      const e = r.w * (r.o - pr);
      const h = r.w * pr * (1 - pr);
      for (let i = 0; i < p; i++) {
        g[i] += e * X[n][i];
        for (let j = 0; j < p; j++) H[i][j] += h * X[n][i] * X[n][j];
      }
    });
    const d = solve(H, g);
    b = b.map((v, i) => v + d[i]);
    if (d.every((v) => Math.abs(v) < 1e-9)) break;
  }
  const Hinv = inv(H);
  // sandwich: sum over clusters of (sum score)(sum score)'
  const groups = new Map();
  rows.forEach((r, n) => {
    const key = cluster ? cluster(r) : n;
    const s = X[n].reduce((a, v, i) => a + v * b[i], 0);
    const e = r.w * (r.o - 1 / (1 + Math.exp(-s)));
    const acc = groups.get(key) ?? new Array(p).fill(0);
    for (let i = 0; i < p; i++) acc[i] += e * X[n][i];
    groups.set(key, acc);
  });
  const meat = Array.from({ length: p }, () => new Array(p).fill(0));
  for (const sc of groups.values()) for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) meat[i][j] += sc[i] * sc[j];
  const G = groups.size;
  const adj = G > 1 ? G / (G - 1) : 1;
  const V = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => {
      let s = 0;
      for (let a = 0; a < p; a++) for (let c = 0; c < p; c++) s += Hinv[i][a] * meat[a][c] * Hinv[c][j];
      return s * adj;
    }),
  );
  return { b, se: b.map((_, i) => Math.sqrt(Math.max(0, V[i][i]))), n: rows.length, clusters: G, V };
}

export const wloss = (rows, f) => {
  let s = 0;
  let w = 0;
  for (const r of rows) {
    const z = f(r);
    s += r.w * (r.o ? Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z)));
    w += r.w;
  }
  return w ? s / w : NaN;
};

/**
 * Duel records. `runR`, `runQ`: harness rating runs (race, qualifying) with pre[].rated and post[]. K = number of weekends after the move.
 * Movers: all teammate duels in the first K weekends at the new team, with the strict prior rating (before the last weekend for the old team).
 * Stayers: teammate duels in K-blocks with ratings frozen at the block start (tenure >= 10, both unchanged), the harness's reference.
 */
export function duelRecords(env, runR, runQ, K, dobOf, dateOf, adapt = null) {
  const { idx, timeline } = env;
  const moves = findMoves(idx).filter((m) => m.valid);
  const k = runR.k;
  const ad = (t, id) => (adapt?.[t] ? (adapt[t].get(String(id)) ?? 0) : 0);
  const mv = [];
  for (const ev of moves) {
    const d = ev.driverId;
    const preE = runR.pre[ev.ell];
    const qE = runQ.pre[ev.ell];
    if (!preE?.rated?.has(d) || !qE?.rated?.has(d)) continue;
    const apps = idx.appear.get(d);
    const pos = apps.findIndex((a) => a.i === ev.ell);
    const back = pos >= 10 ? apps[pos - 10].i : null;
    const momentum = back == null ? NaN : (runR.post[ev.ell].drivers.get(d)?.m ?? NaN) - (runR.post[back].drivers.get(d)?.m ?? NaN);
    const mE = meanMap(preE.rated);
    const rowOld = timeline[ev.ell].rows.find((r) => String(r.driverId) === String(d));
    const rowNew = timeline[ev.t0].rows.find((r) => String(r.driverId) === String(d));
    const cOld = preE.cars.get(rowOld.constructorId) - meanMap(preE.cars);
    const cNew = runR.pre[ev.t0].cars.get(rowNew.constructorId) - meanMap(runR.pre[ev.t0].cars);
    const date = dateOf(ev.ell);
    const age = date && dobOf(d) ? (date - dobOf(d)) / 3.15576e10 : NaN;
    ev.apps.slice(0, K).forEach((app, j) => {
      timeline[app.i].obs.race.forEach((ob, q) => {
        if (!ob.same || (ob.x !== d && ob.y !== d)) return;
        const sign = ob.x === d ? 1 : -1;
        const mate = sign > 0 ? ob.y : ob.x;
        const rM = preE.rated.get(mate);
        const qM = qE.rated.get(mate);
        if (!Number.isFinite(rM) || !Number.isFinite(qM)) return;
        mv.push({
          kind: 'mover',
          year: ev.year,
          cluster: `${d}@${ev.t0}`,
          driverId: d,
          mate,
          t0: ev.t0,
          ell: ev.ell,
          j: j + 1,
          z: k * (preE.rated.get(d) - rM + ad(app.i, d) - ad(app.i, mate)),
          zOn: sign * runR.z[app.i].adj[q],
          sdG: Math.hypot(runR.post[ev.ell].drivers.get(d)?.sd ?? NaN, runR.post[ev.ell].drivers.get(mate)?.sd ?? NaN),
          zq: k * (qE.rated.get(d) - qM),
          o: sign > 0 ? ob.o : 1 - ob.o,
          w: ob.w,
          src: ob.src,
          dCar: k * (cOld - cNew),
          winter: ev.winter ? 1 : 0,
          nPrior: ev.nPrior,
          momentum,
          age,
          mateTenure: idx.tenure[ev.t0].get(mate) ?? NaN,
          moverTenureOld: idx.tenure[ev.ell].get(d) ?? NaN,
          absGap: Math.abs(preE.rated.get(d) - rM),
          mEll: mE,
        });
      });
    });
  }
  const st = [];
  timeline.forEach((w, t) => {
    const f = t - (t % K);
    if (f < 0) return;
    const pre = runR.pre[f];
    const qpre = runQ.pre[f];
    w.obs.race.forEach((ob) => {
      if (!ob.same) return;
      const tx = idx.tenure[f].get(ob.x);
      const ty = idx.tenure[f].get(ob.y);
      if (!(tx >= 10 && ty >= 10)) return;
      if (idx.teamAt[f].get(ob.x) !== idx.teamAt[t].get(ob.x) || idx.teamAt[f].get(ob.y) !== idx.teamAt[t].get(ob.y)) return;
      const gap = pre.rated.get(ob.x) - pre.rated.get(ob.y);
      const qgap = qpre?.rated?.get(ob.x) - qpre?.rated?.get(ob.y);
      if (!Number.isFinite(gap) || !Number.isFinite(qgap)) return;
      st.push({
        kind: 'stayer',
        x: ob.x,
        y: ob.y,
        f,
        sdG: Math.hypot(runR.post[f].drivers.get(ob.x)?.sd ?? NaN, runR.post[f].drivers.get(ob.y)?.sd ?? NaN),
        year: w.year,
        cluster: `${ob.x}|${ob.y}@${w.year}`,
        z: k * gap,
        zq: k * qgap,
        o: ob.o,
        w: ob.w,
        src: ob.src,
        j: t - f + 1,
        absGap: Math.abs(gap),
      });
    });
  });
  return { movers: mv, stayers: st };
}
