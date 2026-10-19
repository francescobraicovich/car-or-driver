// Calibrate the free noise parameters of the v2 world so that the SHIPPED filter, run on a world, behaves as it does on the real data:
// the loss by observation source, in the wet, the calibration multiplier, for race and qualifying (research/eval, docs/evaluation.md).
//
//   node packages/research/node/simulation-calibrate.mjs --session race --params sigmaStint,luckDriver [--seeds 3] [--last 2011]
//
// A coordinate search with multiplicative steps on the named parameters (nested names like race.sdC are allowed) against the squared
// distance between the world's and the real data's figures (2008-2011). The real figures are computed here, from the real calendar's
// results, with the same code. Prints the parameter values reached; nothing is written.
import { loadData } from './common.mjs';
import { indexTimeline, predictiveMetrics, stateSpaceRun, syntheticWorld, truncateTimeline, worldFromHyper } from '../../eval/src/index.js';
import { WORLD_V2_DEFAULTS, worldParamsV2 } from '../../eval/src/synthetic-v2.js';
import { prepareReal } from '../../eval/src/pipeline.js';
import { nll } from '../../eval/src/stats.js';

const argv = process.argv.slice(2);
const opt = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? dflt : argv[i + 1];
};
const all = (name) => argv.flatMap((a, i) => (a === `--${name}` ? [argv[i + 1]] : []));
const session = opt('session', 'race');
const names = String(opt('params')).split(',');
const nSeeds = +opt('seeds', 3);
const last = +opt('last', 2011);
const passes = +opt('passes', 3);

const data = await loadData(new URL('../../../data', import.meta.url).pathname);
const prep = prepareReal(data, { holdout: false });
const timeline = truncateTimeline(prep.timeline, last);
const idx = indexTimeline(timeline, prep.identity);

const getp = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function setp(obj, path, v) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] = { ...o[k] };
  o[keys.at(-1)] = v;
}
const base = worldParamsV2(worldFromHyper);
for (const kv of all('set')) {
  const [k, v] = kv.split('=');
  setp(base, k, JSON.parse(v));
}

function stats(tl) {
  const run = stateSpaceRun(tl, session, prep.ctx, {});
  const idxW = indexTimeline(tl, prep.identity);
  const pm = predictiveMetrics(idxW, { [session]: run });
  const c = pm.slopes[session];
  const rows = pm.rowsBy[session].filter((r) => r.year >= 2008);
  const grp = (pick) => {
    const sel = rows.filter(pick);
    const w = sel.reduce((a, r) => a + r.w, 0);
    return w ? sel.reduce((a, r) => a + r.w * nll(c * r.z, r.o), 0) / w : NaN;
  };
  const out = { mult: c, all: grp(() => true), mates: grp((r) => r.same), cars: grp((r) => !r.same) };
  if (session === 'race')
    Object.assign(out, {
      finish: grp((r) => r.src === 'finish'),
      paceW: grp((r) => r.src === 'paceW'),
      wet: grp((r) => r.wet),
      dry: grp((r) => !r.wet),
    });
  return out;
}
const real = stats(timeline);
const keys = String(opt('keys', session === 'race' ? 'all,mates,cars,finish,paceW,wet,dry' : 'all,mates,cars')).split(',');
const f = (v) => (Number.isFinite(v) ? v.toFixed(4) : 'n/a');

function worldStats(params) {
  const acc = {};
  for (let seed = 1; seed <= nSeeds; seed++) {
    const w = syntheticWorld(timeline, idx, session, params, seed);
    const s = stats(w.timeline);
    for (const [k, v] of Object.entries(s)) (acc[k] ??= []).push(v);
  }
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
}
const objective = (s) => keys.reduce((a, k) => a + (s[k] - real[k]) ** 2, 0) + (s.mult - real.mult) ** 2;

console.log(`real ${session} 2008-${last}:`, keys.map((k) => `${k} ${f(real[k])}`).join('  '), `mult ${f(real.mult)}`);
let cur = base;
let curStats = worldStats(cur);
let best = objective(curStats);
console.log(
  'start',
  names.map((n) => `${n}=${getp(cur, n)}`).join(' '),
  '->',
  keys.map((k) => `${k} ${f(curStats[k])}`).join('  '),
  `mult ${f(curStats.mult)}  J ${best.toExponential(2)}`,
);
let step = 1.5;
for (let pass = 0; pass < passes; pass++) {
  let improved = false;
  for (const n of names) {
    for (const dir of [1, -1]) {
      for (let tries = 0; tries < 5; tries++) {
        const v0 = getp(cur, n);
        const v = dir > 0 ? v0 * step : v0 / step;
        const cand = JSON.parse(JSON.stringify(cur));
        setp(cand, n, v);
        const s = worldStats(cand);
        const J = objective(s);
        console.log(
          `  ${n} ${v0.toPrecision(4)} -> ${v.toPrecision(4)}: ${keys.map((k) => `${k} ${f(s[k])}`).join(' ')} mult ${f(s.mult)} J ${J.toExponential(2)}`,
        );
        if (J < best) {
          best = J;
          cur = cand;
          curStats = s;
          improved = true;
        } else break;
      }
    }
  }
  console.log(`pass ${pass + 1}: ${names.map((n) => `${n}=${getp(cur, n).toPrecision(4)}`).join(' ')}  J ${best.toExponential(2)}`);
  if (!improved) step = 1 + (step - 1) / 2;
}
console.log('\nresult:', names.map((n) => `${n}=${getp(cur, n).toPrecision(5)}`).join(' '));
console.log('world:', keys.map((k) => `${k} ${f(curStats[k])}`).join('  '), `mult ${f(curStats.mult)}`);
void WORLD_V2_DEFAULTS;
