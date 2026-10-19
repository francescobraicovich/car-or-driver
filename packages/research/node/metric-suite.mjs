// One backtesting suite for every metric we optimise or guard (docs/metrics.md). computeSuite(env, cfg, qualRun) scores a race configuration on:
//   P  overall predictive loss and calibration (the model must stay a good rating system)
//   S  strict forecasts of drivers in a new car from the rating posted before the move
//   M  diagnostics of why movers are harder (docs/diagnosis.md): slope ratio, large gaps, early weekends, residual portability, uncertainty
//   T  the separation scorecard and truth-free guards of the earlier climbs
// Nothing here is tuned to a window: selection windows are chosen by the caller (`sel` = moves through 2015, `late` = 2012+).
import { indexTimeline, stateSpaceRun, findMoves } from '../../eval/src/index.js';
import { evalConfig, FINAL } from './strict-eval.mjs';
import { duelRecords, logit } from './diagnostics-library.mjs';
import { scorePoint } from './cross-session.mjs';
import { arrivalOffsets } from '../../core/src/state-space/qualifying-link.js';

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
export const CAL = (rows, key = 'z') => logit(rows, [(r) => r[key]], { cluster: (r) => r.cluster });

/** Duel-based diagnostics on a pair of rating runs. Returns { name: value } and the standard errors where cheap. */
export function moverDiagnostics(env, runs, qualRun, K = 10, windows = { sel: [2002, 2015], late: [2012, 2015] }, adapt = null) {
  const { movers, stayers } = duelRecords(
    env,
    runs.race,
    qualRun,
    K,
    () => undefined,
    () => undefined,
    adapt,
  );
  const out = {};
  const inW = (w) => (r) => r.year >= w[0] && r.year <= w[1];
  for (const [wname, w] of Object.entries(windows)) {
    const M = movers.filter(inW(w));
    const S = stayers.filter(inW(w));
    if (M.length < 60 || S.length < 60) continue;
    const cm = CAL(M);
    const cs = CAL(S);
    out[`slope.movers.${wname}`] = cm.b[0];
    out[`slope.stayers.${wname}`] = cs.b[0];
    out[`slope.ratio.${wname}`] = cm.b[0] / cs.b[0];
    // pooled difference with interaction (cluster-robust)
    const it = logit([...M, ...S], [(r) => r.z, (r) => (r.kind === 'mover' ? r.z : 0)], { cluster: (r) => r.cluster });
    out[`slope.diff.${wname}`] = it.b[1];
    out[`slope.diff.z.${wname}`] = it.b[1] / it.se[1];
    // large prior gaps
    const big = (rows) =>
      logit(rows, [(r) => (r.absGap < 25 ? r.z : 0), (r) => (r.absGap >= 25 ? r.z : 0)], { cluster: (r) => r.cluster, init: [0.8, 0.8] });
    const bm = big(M);
    const bs = big(S);
    out[`largeGap.movers.${wname}`] = bm.b[1];
    out[`largeGap.stayers.${wname}`] = bs.b[1];
    out[`largeGap.ratio.${wname}`] = bm.b[1] / bs.b[1];
    // portability of the race-specific residual: z = beta*zq + zD
    const beta = runs.beta ?? FINAL.beta;
    const port = (rows) =>
      logit(
        rows.filter((r) => Number.isFinite(r.zq)),
        [(r) => r.z - beta * r.zq, (r) => r.zq],
        { cluster: (r) => r.cluster, init: [0.8, 0.5] },
      );
    const pm = port(M);
    const ps = port(S);
    out[`resid.weight.movers.${wname}`] = pm.b[0];
    out[`resid.weight.stayers.${wname}`] = ps.b[0];
    out[`resid.weight.ratio.${wname}`] = pm.b[0] / ps.b[0];
    // uncertainty: does the posted gap sd flag the unreliable ratings?
    const ok = M.filter((r) => Number.isFinite(r.sdG)).sort((a, b) => a.sdG - b.sdG);
    const third = Math.floor(ok.length / 3);
    const lo = ok.slice(0, third);
    const hi = ok.slice(ok.length - third);
    out[`sd.gradient.${wname}`] = Math.max(-5, Math.min(5, CAL(lo).b[0] - CAL(hi).b[0])); // slope(low sd) - slope(high sd): optimum >= 0 and large when sd is informative
    out[`sd.ratio.${wname}`] =
      mean(M.filter((r) => Number.isFinite(r.sdG)).map((r) => r.sdG)) / mean(S.filter((r) => Number.isFinite(r.sdG)).map((r) => r.sdG));
  }
  // early weekends (all moves of the selection window), mover-centred residual of the frozen prior and of the filter's online forecast
  const sel = movers.filter(inW(windows.sel));
  const cs = CAL(stayers.filter(inW(windows.sel))).b[0];
  const resid = (rows, online) => {
    let s = 0;
    let w = 0;
    for (const r of rows) {
      s += r.w * (r.o - 1 / (1 + Math.exp(-(online ? r.zOn : cs * r.z))));
      w += r.w;
    }
    return w ? s / w : NaN;
  };
  for (const [lab, a, b] of [
    ['w1', 1, 1],
    ['w2_3', 2, 3],
    ['w4_10', 4, 10],
  ]) {
    const rows = sel.filter((r) => r.j >= a && r.j <= b);
    out[`early.frozen.${lab}`] = resid(rows, false);
    out[`early.online.${lab}`] = resid(
      rows.filter((r) => Number.isFinite(r.zOn)),
      true,
    );
  }
  out['moves.sel'] = new Set(sel.map((r) => r.cluster)).size;
  return out;
}

/** Everything about one configuration on the real data. */
export function computeSuite(env, cfg, qualRun, { K = 10 } = {}) {
  const r = evalConfig(env, cfg, qualRun);
  const H = (k) => r.res.headline[k]?.est;
  const m = {};
  for (const w of ['fit', 'w2', 'w3']) {
    m[`P.all.${w}`] = r.loss[`${w}.combined.all`];
    m[`P.mates.${w}`] = r.loss[`${w}.combined.mates`];
    m[`P.cars.${w}`] = r.loss[`${w}.combined.cars`];
    m[`P.race.${w}`] = r.loss[`${w}.race.all`];
  }
  m['P.calSlope'] = H('predictive.calSlope.race.all');
  m['P.walkForward.w2'] = H('predictive.walkForward.race.w2');
  m['P.walkForward.w3'] = H('predictive.walkForward.race.w3');
  for (const w of ['2002-11', '2012-15', '2016+']) {
    for (const k of [5, 10]) {
      const s = r.strict[`${w}.k${k}`];
      m[`S.tm.${w}.k${k}`] = s.tmLoss;
      m[`S.fd.${w}.k${k}`] = s.fdLoss;
      m[`S.slope.${w}.k${k}`] = s.tmSlope;
      m[`S.slopeStay.${w}.k${k}`] = s.stSlope;
      m[`S.stayLoss.${w}.k${k}`] = s.stLoss;
    }
  }
  const diag = moverDiagnostics(
    env,
    { ...r.runs, beta: cfg.beta },
    qualRun,
    K,
    undefined,
    arrivalOffsets(env.timeline, env.prep.ctx.canon, cfg.adapt ?? null),
  );
  for (const [k, v] of Object.entries(diag)) m[`M.${k}`] = v;
  m['T.D2'] = r.sep.D2;
  for (const [i, t] of ['T1', 'T2', 'T3', 'T4'].entries())
    m[`T.race.${t}`] = [r.sep.race.T1, r.sep.race.T2, r.sep.race.T3, r.sep.race.T4][i];
  m['T.qual.D'] = r.sep.qual.D;
  m['G.effDriver'] = H('health.race.efficiency.driver');
  m['G.effCar'] = H('health.race.efficiency.car');
  m['G.rookieBias'] = H('rookies.race.bias.first5');
  m['G.leakFree.winterUnchanged'] = H('shocks.race.leakFree.winterUnchanged');
  m['G.leakFree.winterJoined'] = H('shocks.race.leakFree.winterJoined');
  m['G.leakFree.season'] = H('shocks.race.leakFree.season');
  m['G.leak.winterUnchanged'] = H('shocks.race.leak.winterUnchanged');
  m['G.leak.season'] = H('shocks.race.leak.season');
  m['G.z2.driver'] = H('health.race.uncertainty.driver.z2');
  m['G.cover90.driver'] = H('health.race.uncertainty.driver.cover90');
  m['G.control5'] = r.res.sessions.race.movers.step[5].controlRms;
  m['G.online5'] = H('movers.race.onlineLoss.k5');
  return { m, r };
}
export { indexTimeline, stateSpaceRun, findMoves, scorePoint };
