// Realism check of the synthetic worlds (research/eval, docs/evaluation.md "Simulator v2"): the shipped filter on a world against the
// real data, by observation source, weather and window, and the likelihood weight that forecasts the world best.
//
//   node packages/research/node/simulation-check.mjs [--version 2] [--seeds 3] [--last 2011] [--set key=value ...] [--tau]
//
// `--set` overrides a world parameter (`wetSpread=0.9`, `race.sdC=40`, `sigmaStint=0.2`, `numberOne.race=0`; JSON values allowed).
// The window scored is 2008-2011 (the out-of-fit window available up to 2011); with --last 2015 it is 2008-2015, the window of
// research/eval/baseline.txt. It reads the real CALENDAR of the weeks it covers and nothing of the real results beyond the
// slices it prints for comparison.
import { loadData } from './common.mjs';
import { STATE_SPACE } from '../../core/src/presets/state-space.js';
import { STATE_SPACE_DEFAULTS } from '../../core/src/state-space/filter.js';
import {
  indexTimeline,
  observationRows,
  fitSlope,
  predictiveMetrics,
  linkDistances,
  stateSpaceRun,
  syntheticWorld,
  truncateTimeline,
  worldFromHyper,
} from '../../eval/src/index.js';
import { worldParamsV2 } from '../../eval/src/synthetic-v2.js';
import { prepareReal } from '../../eval/src/pipeline.js';
import { nll } from '../../eval/src/stats.js';

const argv = process.argv.slice(2);
const opt = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? dflt : argv[i + 1];
};
const all = (name) => argv.flatMap((a, i) => (a === `--${name}` ? [argv[i + 1]] : []));
const version = +opt('version', 2);
const nSeeds = +opt('seeds', 3);
const last = +opt('last', 2011);
const tauScan = argv.includes('--tau');
const sessions = String(opt('sessions', 'race,qual')).split(',');

const data = await loadData(new URL('../../../data', import.meta.url).pathname);
const prep = prepareReal(data, { holdout: false });
const timeline = truncateTimeline(prep.timeline, last);
const idx = indexTimeline(timeline, prep.identity);
const hyper = (s) => ({ ...STATE_SPACE_DEFAULTS, ...STATE_SPACE[s] });

const params = version === 2 ? worldParamsV2(worldFromHyper) : { ...worldFromHyper(hyper('race')) };
for (const kv of all('set')) {
  const [k, v] = kv.split('=');
  let val;
  try {
    val = JSON.parse(v);
  } catch {
    val = v;
  }
  const path = k.split('.');
  let o = params;
  for (const key of path.slice(0, -1)) o = o[key] = { ...o[key] };
  o[path.at(-1)] = val;
}

const f = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '  n/a');
function summarize(label, tl, session, runHyper = {}) {
  const run = stateSpaceRun(tl, session, prep.ctx, runHyper);
  const idxW = indexTimeline(tl, prep.identity);
  const pm = predictiveMetrics(idxW, { [session]: run }, { distance: linkDistances(idxW) });
  const rows = pm.rowsBy[session].filter((r) => r.year >= 2008);
  const c = pm.slopes[session];
  const bySrc = {};
  for (const r of rows) {
    const b = (bySrc[r.src] ??= { n: 0, w: 0, loss: 0, o1: 0, num: 0, den: 0 });
    b.n++;
    b.w += r.w;
    b.loss += r.w * nll(c * r.z, r.o);
    b.o1 += r.o;
  }
  const wet = {};
  for (const r of rows) {
    const b = (wet[r.wet ? 'wet' : 'dry'] ??= { w: 0, loss: 0, n: 0 });
    b.w += r.w;
    b.loss += r.w * nll(c * r.z, r.o);
    b.n++;
  }
  const table = pm.table.filter((t) => t.window === 'w2');
  return { label, c, bySrc, wet, slices: pm.slices[session], table, pm, rows };
}

function report(res, session) {
  const w2 = Object.fromEntries(res.table.map((t) => [t.pair, t[session]]));
  console.log(
    `  ${res.label} ${session}: multiplier ${f(res.c, 3)}  loss 2008-11 all ${f(w2.all.loss)} mates ${f(w2.mates.loss)} cars ${f(w2.cars.loss)}`,
  );
  const srcs = Object.entries(res.bySrc).sort();
  console.log(
    '    by source: ' +
      srcs
        .map(([k, b]) => `${k} n ${b.n} loss ${f(b.loss / b.w)} o=1 ${f(b.o1 / b.n, 3)} slope ${f(res.slices.source[k]?.calSlope, 2)}`)
        .join(' | '),
  );
  if (session === 'race')
    console.log(
      '    weather: ' +
        Object.entries(res.wet)
          .map(([k, b]) => `${k} n ${b.n} loss ${f(b.loss / b.w)}`)
          .join(' | '),
    );
  if (res.slices.variance?.low)
    console.log(
      '    variance terciles: ' +
        Object.entries(res.slices.variance)
          .map(([k, v]) => `${k} ${f(v.loss)} (sd ${f(v.meanSd, 1)})`)
          .join(' | '),
    );
}

console.log(`world version ${version}, calendar through ${last}, ${nSeeds} seeds, scored 2008-${last}`);
for (const session of sessions) {
  console.log(`\n== ${session}`);
  report(summarize('REAL', timeline, session), session);
  for (let seed = 1; seed <= nSeeds; seed++) {
    const t0 = Date.now();
    const w = syntheticWorld(timeline, idx, session, params, seed);
    const res = summarize(`world seed ${seed} (${((Date.now() - t0) / 1000).toFixed(1)}s incl. filter)`, w.timeline, session);
    report(res, session);
    if (tauScan && seed === 1) {
      const grid = [0.003, 0.01, 0.025, 0.05, 0.1, 0.2];
      const losses = grid.map((tau) => {
        const run = stateSpaceRun(w.timeline, session, prep.ctx, { tau });
        const idxW = indexTimeline(w.timeline, prep.identity);
        const rows = observationRows(idxW, run);
        const c = fitSlope(rows.filter((r) => r.year <= 2007));
        const sel = rows.filter((r) => r.year >= 2008);
        return sel.reduce((a, r) => a + r.w * nll(c * r.z, r.o), 0) / sel.reduce((a, r) => a + r.w, 0);
      });
      console.log(
        '    tau scan (2008-11 loss, multiplier fitted on 2002-07): ' +
          grid.map((g, i) => `${g}:${f(losses[i])}`).join('  ') +
          `   shipped tau ${hyper(session).tau}`,
      );
    }
  }
  if (tauScan) {
    const grid = [0.003, 0.01, 0.025, 0.05, 0.1, 0.2];
    const losses = grid.map((tau) => {
      const run = stateSpaceRun(timeline, session, prep.ctx, { tau });
      const rows = observationRows(idx, run);
      const c = fitSlope(rows.filter((r) => r.year <= 2007));
      const sel = rows.filter((r) => r.year >= 2008);
      return sel.reduce((a, r) => a + r.w * nll(c * r.z, r.o), 0) / sel.reduce((a, r) => a + r.w, 0);
    });
    console.log('  REAL tau scan: ' + grid.map((g, i) => `${g}:${f(losses[i])}`).join('  '));
  }
}
