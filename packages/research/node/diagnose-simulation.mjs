// The same diagnosis on Simulator v2 worlds, where the cause is known and the true (portable) driver levels give an oracle.
//   node packages/research/node/diagnose-simulation.mjs [--seeds 1,2,3,4] [--scenarios name,name]
// Prints, per scenario: movers' and stayers' calibration slope of the filter's strict prior rating, of the oracle (true portable gap), the weight of the
// qualifying gap beyond the race gap, the early-weekend residual, and the oracle loss (how much of the duel outcome is knowable at all).
import { indexTimeline, stateSpaceRun, truncateTimeline, worldFromHyper, worldParamsV2 } from '../../eval/src/index.js';
import { loadData } from './common.mjs';
import { prepareReal } from '../../eval/src/pipeline.js';
import { merge } from './separation-report.mjs';
import { FINAL } from './strict-eval.mjs';
import { qualLink } from '../../core/src/state-space/qualifying-link.js';
import { duelRecords, logit, wloss } from './diagnostics-library.mjs';
import { bothSessions } from './simulation-both.mjs';

const argv = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i < 0 ? d : argv[i + 1];
};
const seeds = String(opt('seeds', '1,2,3,4')).split(',').map(Number);
const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
export const SCENARIOS = {
  default: {},
  'no driver-car fit': { sdInt: { race: 0, qual: 0 } },
  'fit x3': { sdInt: { race: 15, qual: 5.4 } },
  'race fit x3, qual fit as is': { sdInt: { race: 15, qual: 1.8 } },
  'move change 15': { moveSd: 15 },
  'race/qual skill corr 0.4': { rDrv: 0.4 },
  'race/qual skill corr 0.95': { rDrv: 0.95 },
  'weekend form noise x2': { formSd: { race: 30, qual: 56 } },
  'number-one x3': { numberOne: { race: 4.5, qual: 3 } },
};
const data = await loadData(new URL('../../../data', import.meta.url).pathname);
const prep = prepareReal(data, { holdout: false });
const timeline = truncateTimeline(prep.timeline, 2015);
const idx0 = indexTimeline(timeline, prep.ctx);
const base = merge({});
const names = opt('scenarios') ? String(opt('scenarios')).split(',') : Object.keys(SCENARIOS);
const cal = (rows, key = 'z') => logit(rows, [(r) => r[key]], { cluster: (r) => r.cluster });
console.log(
  `# Simulator v2, ${seeds.length} seeds each, race, final model, first 10 weekends after a move. slope = calibration of the frozen strict gap (movers | stayers); oracle = true portable gap`,
);
for (const name of names) {
  const params = worldParamsV2(worldFromHyper, {}, { version: 2, ...SCENARIOS[name] });
  const M = [];
  const S = [];
  for (const seed of seeds) {
    const world = bothSessions(timeline, idx0, params, seed);
    const tl = world.timeline;
    const idx = indexTimeline(tl, prep.ctx);
    const qual = stateSpaceRun(tl, 'qual', prep.ctx, base.qual);
    const race = stateSpaceRun(tl, 'race', { ...prep.ctx, ...qualLink(qual, FINAL.beta, FINAL.gamma) }, { ...base.race, ...FINAL.race });
    const { movers, stayers } = duelRecords(
      { idx, timeline: tl, prep },
      race,
      qual,
      10,
      () => undefined,
      () => undefined,
    );
    const k = race.k;
    for (const r of movers) {
      const tr = world.truth.drivers[r.ell];
      r.zt = k * (tr.get(r.driverId) - tr.get(r.mate));
      r.cluster = `${seed}:${r.cluster}`;
    }
    for (const r of stayers) {
      const tr = world.truth.drivers[r.f];
      r.zt = k * (tr.get(r.x) - tr.get(r.y));
      r.cluster = `${seed}:${r.cluster}`;
    }
    M.push(...movers.filter((r) => Number.isFinite(r.zt)));
    S.push(...stayers.filter((r) => Number.isFinite(r.zt)));
  }
  const cm = cal(M);
  const cs = cal(S);
  const tm = cal(M, 'zt');
  const ts = cal(S, 'zt');
  const two = logit(M, [(r) => r.z, (r) => r.zq], { cluster: (r) => r.cluster, init: [0.8, 0.2] });
  const j1 = M.filter((r) => r.j === 1);
  const resid1 = j1.reduce((s, r) => s + r.w * (r.o - 1 / (1 + Math.exp(-cs.b[0] * r.z))), 0) / j1.reduce((s, r) => s + r.w, 0);
  console.log(
    `${name.padEnd(28)} filter slope movers ${f(cm.b[0])}±${f(cm.se[0])} stayers ${f(cs.b[0])} | oracle slope movers ${f(tm.b[0])} stayers ${f(ts.b[0])} | oracle loss movers ${f(
      wloss(M, (r) => tm.b[0] * r.zt),
      4,
    )} filter loss movers ${f(
      wloss(M, (r) => cs.b[0] * r.z),
      4,
    )} | qual weight beyond race (movers) ${f(two.b[1])}±${f(two.se[1])} | resid j1 ${f(resid1, 3)} | moves ${new Set(M.map((r) => r.cluster)).size}`,
  );
  const big = (rows) =>
    logit(rows, [(r) => (r.absGap < 25 ? r.z : 0), (r) => (r.absGap >= 25 ? r.z : 0)], { cluster: (r) => r.cluster, init: [0.8, 0.8] });
  const bm = big(M);
  const bs = big(S);
  const sdM = M.reduce((a, r) => a + r.sdG, 0) / M.length;
  const sdS = S.reduce((a, r) => a + r.sdG, 0) / S.length;
  console.log(
    `   large-gap slope (>=25 pts) movers ${f(bm.b[1])}±${f(bm.se[1])} stayers ${f(bs.b[1])}±${f(bs.se[1])} | small-gap movers ${f(bm.b[0])} stayers ${f(bs.b[0])} | mean gap sd movers ${f(sdM, 1)} stayers ${f(sdS, 1)}`,
  );
}
