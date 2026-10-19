// The separation scorecard: how cleanly a rating run tells a driver's strength from his car's, with every term measured RELATIVE TO A CONTROL
// GROUP, so that a model that simply refuses to move its ratings cannot score well on it.
//
// Control group: drivers in teams whose lineup did not change over the same weekends (`makeControls` of the harness, net of how the field's
// centring moved). Four terms per session, each 0 when the model behaves like its control and growing with the deviation:
//
//   T1 mover swing      mean over k = 1, 3, 5, 10 races of |ln R|, R = rms step of drivers who changed team / rms step of the control
//   T2 stayer swing     mean over k = 3, 5, 10 of |ln R|, R = rms step of the driver who stays when an established driver arrives / control
//   T3 stayer leak      mean over k = 3, 5, 10 of |slope| * sd(x) / control rms, where the slope is the stayer's step on how much stronger the
//                       incoming driver is than the one replaced (points per point) and sd(x) the spread of that strength gap: how many
//                       control swings the stayer's rating moves because of WHO joined
//   T4 frozen transfer  mean over k = 5, 10 of |ln r|, r = calibration slope of a mover's frozen pre-move rating against his new teammate /
//                       the same slope for teammates who stayed (r = 1: a move costs a rating no predictive power); r is floored at 0.1
//
// D2 = mean over the two sessions of (T1 + T2 + T3 + T4) / 4. Everything is a pure function of the harness output and the events (docs/history/state-space-hill-climbing-2.md).
// None of it needs a synthetic world.
import { catalogue, driverPost, makeControls, mean, ols, indexTimeline } from '../../eval/src/index.js';

export const H_MOVER = [1, 3, 5, 10];
export const H_STAYER = [3, 5, 10];
export const H_LEAK = [3, 5, 10];
export const H_FROZEN = [5, 10];

const sdOf = (a) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

/** The items of the stayer's step at horizon K, as the harness builds them, with the strength gap of the newcomer. */
function stayerItems(idx, run, changes, K, controls) {
  const items = [];
  for (const ch of changes) {
    if (!ch.valid || ch.weeksAfter.length < K) continue;
    const tK = ch.weeksAfter[K - 1];
    const ctl = controls.drivers(ch.ellT, tK);
    if (!ctl) continue;
    const inc = ch.movers.map((m) => driverPost(run, m.ell, m.driverId));
    const out = ch.outgoing.map((d) => driverPost(run, ch.ellT, d)).filter(Number.isFinite);
    const xIn = inc.every(Number.isFinite) ? mean(inc) : NaN;
    const xRep = out.length && Number.isFinite(xIn) ? xIn - mean(out) : NaN;
    for (const s of ch.stayers) {
      if (!idx.lineup[tK].get(ch.team)?.includes(s)) continue;
      const a = driverPost(run, ch.ellT, s);
      const b = driverPost(run, tK, s);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      items.push({ delta: b - a - ctl.mean, ctlRms: ctl.rms, xRep });
    }
  }
  return items;
}

/**
 * Terms of one session.
 * @param {object} res    evaluateModel(...) output (`res.sessions[session]`)
 * @param {string} session
 * @param {object} idx    indexTimeline(timeline, identity)
 * @param {object} run    the session's rating run
 * @param {{ changes: object[] }} events  catalogue(idx)
 */
export function sessionTerms(res, session, idx, run, events) {
  const S = res.sessions[session];
  const est = (x) => x?.est;
  const raw = { mover: {}, stayer: {}, leak: {}, frozen: {}, control: {} };
  const ln = (r) => (Number.isFinite(r) && r > 0 ? Math.abs(Math.log(r)) : NaN);
  for (const K of H_MOVER) {
    raw.mover[K] = est(S.movers.step[K].rmsRatio);
    raw.control[K] = S.movers.step[K].controlRms;
  }
  for (const K of H_STAYER) raw.stayer[K] = est(S.teammates.step[K].rmsRatio);
  const controls = makeControls(idx, run);
  for (const K of H_LEAK) {
    const items = stayerItems(idx, run, events.changes, K, controls);
    const withX = items.filter((x) => Number.isFinite(x.xRep));
    const slope = ols(
      withX.map((x) => x.xRep),
      withX.map((x) => x.delta),
    ).b;
    const ctl = Math.sqrt(mean(items.map((x) => x.ctlRms ** 2)));
    const sdX = sdOf(withX.map((x) => x.xRep));
    raw.leak[K] = { slope, sdX, ctl, units: (Math.abs(slope) * sdX) / ctl, harness: est(S.teammates.step[K].leakVsReplaced) };
  }
  for (const K of H_FROZEN) {
    const m = est(S.movers.gap[K].slopeMovers);
    const s = est(S.movers.gap[K].slopeStayers);
    raw.frozen[K] = { movers: m, stayers: s, ratio: Number.isFinite(m) && Number.isFinite(s) && s > 0 ? Math.max(0.1, m / s) : NaN };
  }
  const T1 = mean(H_MOVER.map((K) => ln(raw.mover[K])));
  const T2 = mean(H_STAYER.map((K) => ln(raw.stayer[K])));
  const T3 = mean(H_LEAK.map((K) => raw.leak[K].units));
  const T4 = mean(H_FROZEN.map((K) => ln(raw.frozen[K].ratio)));
  const D = (T1 + T2 + T3 + T4) / 4;
  return { T1, T2, T3, T4, D: Number.isFinite(D) ? D : Infinity, raw };
}

/** Terms of both sessions and D2. `runs` = { race, qual } rating runs of the same timeline as `res`. */
export function separationScore(res, timeline, identity, runs) {
  const idx = indexTimeline(timeline, identity);
  const events = catalogue(idx);
  const out = {};
  for (const s of Object.keys(runs)) out[s] = sessionTerms(res, s, idx, runs[s], events);
  const ds = Object.values(out).map((x) => x.D);
  out.D2 = ds.every(Number.isFinite) ? mean(ds) : Infinity;
  return out;
}
