// How the state-space settings were chosen (docs/state-space.md). Prints the fitted settings so they can be
// compared with packages/core/src/presets/state-space.js; it does not write the preset.
//
//   node packages/research/node/state-space-fit.mjs [--stint]
//
// Stage 1 (default): a coordinate search of the main settings for race and for qualifying, minimising the weighted
//   log-loss of the ratings-alone forecast on 2002-2007 (a multiplier on the log-odds is fitted inside the objective).
// Stage 2 (--stint): starting from stage 1's values in the preset, the new-team settings (sdJ, sdA, rhoA, shrinkM) are
//   searched on 2002-2011. 2012 onward is never read, and 2016 onward is never read by anything here.
import { loadData } from './common.mjs';
import { ssContext } from '../../core/src/state-space/build.js';
import { collectExam } from '../../core/src/state-space/exam.js';
import { runStateSpace, STATE_SPACE_DEFAULTS } from '../../core/src/state-space/filter.js';
import { STATE_SPACE } from '../../core/src/presets/state-space.js';

const STINT = process.argv.includes('--stint');
const ctx = await loadData('data');
const { model, weekends } = collectExam(ctx.raw, ctx.lapSnapshots, ctx.maps, {}, ctx.lapPace);
const tmBoost = model.params.tmBoost;
const LAST = STINT ? 2011 : 2007;
const usable = weekends.filter((w) => w.year <= LAST); // causal filter: later weekends cannot change these ratings

const nll = (z, o) => -Math.log(Math.min(1 - 1e-12, Math.max(1e-12, 1 / (1 + Math.exp(-(o ? z : -z))))));

/** Weighted loss of the ratings-alone forecast on [from, to], with one multiplier fitted on 2002-2007. */
function objective(session, hyper, to) {
  const run = runStateSpace(
    usable.map((w) => ({ year: w.year, rows: w.rows, obs: session === 'race' ? w.raceObs : w.qualObs })),
    hyper,
    ssContext(tmBoost),
  );
  const k = Math.LN10 / hyper.s;
  const items = [];
  usable.forEach((w, i) => {
    if (w.year < 2002 || w.year > to) return;
    (session === 'race' ? w.raceObs : w.qualObs).forEach((o, q) => {
      const z = (k * run.predictions[i].mean[q]) / Math.sqrt(1 + (Math.PI / 8) * k * k * run.predictions[i].vari[q]);
      items.push({ z, o: o.o, w: o.w, year: w.year });
    });
  });
  const loss = (c, pick) => {
    let l = 0;
    let wt = 0;
    for (const it of items)
      if (pick(it)) {
        l += it.w * nll(c * it.z, it.o);
        wt += it.w;
      }
    return l / wt;
  };
  let lo = 0.2;
  let hi = 3;
  for (let i = 0; i < 30; i++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (loss(a, (it) => it.year <= 2007) < loss(b, (it) => it.year <= 2007)) hi = b;
    else lo = a;
  }
  return loss((lo + hi) / 2, () => true);
}

function coordinateFit(session, start, spec, to, passes = 3) {
  let h = { ...start };
  let best = objective(session, h, to);
  for (let pass = 0; pass < passes; pass++) {
    let improved = false;
    for (const [key, [lo, hi, step, additive]] of Object.entries(spec)) {
      for (const dir of [1, -1]) {
        for (let tries = 0; tries < 6; tries++) {
          if (key === 'rhoA' && !(h.sdA > 0)) break;
          const cur = h[key];
          const v = additive ? +(cur + dir * step).toFixed(4) : dir > 0 ? cur * step : cur / step;
          if (v < lo || v > hi || v === cur) break;
          const r = objective(session, { ...h, [key]: v }, to);
          if (r < best - 1e-6) {
            best = r;
            h = { ...h, [key]: v };
            improved = true;
          } else break;
        }
      }
    }
    console.error(`  ${session} pass ${pass + 1}: loss ${best.toFixed(5)}`);
    if (!improved) break;
  }
  return h;
}

const MAIN = {
  sdD: [8, 60, 1.3],
  sdNew: [8, 80, 1.3],
  sdC: [10, 120, 1.3],
  rho: [0.3, 1, 0.05, true],
  winterC: [5, 80, 1.3],
  raceC: [0.2, 10, 1.3],
  yearD: [0.5, 20, 1.3],
  tau: [0.002, 1, 1.4],
  thetaT: [0.5, 20, 1.4],
  mPace: [0.1, 40, 1.5],
  mPart: [0.1, 40, 1.5],
};
const NEW_TEAM = { sdJ: [0, 80, 5, true], sdA: [0, 60, 5, true], rhoA: [0.3, 0.97, 0.05, true], shrinkM: [0.4, 1, 0.05, true] };

for (const session of ['race', 'qual']) {
  const h = STINT
    ? coordinateFit(session, { ...STATE_SPACE[session], sdJ: 0, sdA: 0, rhoA: 0.8, shrinkM: 1 }, NEW_TEAM, 2011)
    : coordinateFit(session, { ...STATE_SPACE_DEFAULTS }, MAIN, 2007);
  const keys = STINT ? ['sdJ', 'sdA', 'rhoA', 'shrinkM'] : Object.keys(MAIN);
  console.log(`${session}:`, JSON.stringify(Object.fromEntries(keys.map((k) => [k, h[k]]))));
  console.log(`  preset :`, JSON.stringify(Object.fromEntries(keys.map((k) => [k, STATE_SPACE[session][k]]))));
}
