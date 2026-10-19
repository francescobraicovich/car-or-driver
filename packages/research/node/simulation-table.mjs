// The realism table of docs/evaluation.md ("Simulator v2"): the shipped filter on v2 worlds against the real data, mean and range over seeds.
//
//   node packages/research/node/simulation-table.mjs [--seeds 6] [--tau-seeds 4] [--last 2011] > table.md
//
// Calendar and scored window are 2008-2011 (the out-of-fit window the hill climb may read); the real column is computed from the real
// results of the same weekends with the same code. Prints markdown.
import { loadData } from './common.mjs';
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
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? dflt : argv[i + 1];
};
const nSeeds = +opt('seeds', 6);
const nTau = +opt('tau-seeds', 4);
const last = +opt('last', 2011);
const TAUS = [0.003, 0.01, 0.025, 0.05, 0.1, 0.2];

const data = await loadData(new URL('../../../data', import.meta.url).pathname);
const prep = prepareReal(data, { holdout: false });
const timeline = truncateTimeline(prep.timeline, last);
const idx = indexTimeline(timeline, prep.identity);
const params = worldParamsV2(worldFromHyper);

function measure(tl, session) {
  const run = stateSpaceRun(tl, session, prep.ctx, {});
  const idxW = indexTimeline(tl, prep.identity);
  const pm = predictiveMetrics(idxW, { [session]: run }, { distance: linkDistances(idxW) });
  const c = pm.slopes[session];
  const rows = pm.rowsBy[session].filter((r) => r.year >= 2008);
  const loss = (pick) => {
    const sel = rows.filter(pick);
    const w = sel.reduce((a, r) => a + r.w, 0);
    return w ? sel.reduce((a, r) => a + r.w * nll(c * r.z, r.o), 0) / w : NaN;
  };
  const out = { mult: c, all: loss(() => true), mates: loss((r) => r.same), cars: loss((r) => !r.same) };
  for (const src of ['finish', 'paceW', 'pace', 'partial', 'qual']) {
    const sel = rows.filter((r) => r.src === src);
    out[`${src}.n`] = sel.length;
    out[`${src}.loss`] = loss((r) => r.src === src);
    out[`${src}.o1`] = sel.length ? sel.reduce((a, r) => a + r.o, 0) / sel.length : NaN;
    out[`${src}.slope`] = pm.slices[session].source[src]?.calSlope ?? NaN;
  }
  out.wet = loss((r) => r.wet);
  out.dry = loss((r) => !r.wet);
  return out;
}
function tauCurve(tl, session) {
  const idxW = indexTimeline(tl, prep.identity);
  return TAUS.map((tau) => {
    const rows = observationRows(idxW, stateSpaceRun(tl, session, prep.ctx, { tau }));
    const c = fitSlope(rows.filter((r) => r.year <= 2007));
    const sel = rows.filter((r) => r.year >= 2008);
    return sel.reduce((a, r) => a + r.w * nll(c * r.z, r.o), 0) / sel.reduce((a, r) => a + r.w, 0);
  });
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
const range = (a, d = 3) => `${fmt(mean(a), d)} [${fmt(Math.min(...a), d)}, ${fmt(Math.max(...a), d)}]`;

for (const session of ['race', 'qual']) {
  const real = measure(timeline, session);
  const worlds = [];
  const curves = [];
  for (let seed = 1; seed <= nSeeds; seed++) {
    const w = syntheticWorld(timeline, idx, session, params, seed);
    worlds.push(measure(w.timeline, session));
    if (seed <= nTau) curves.push(tauCurve(w.timeline, session));
  }
  const realCurve = tauCurve(timeline, session);
  const rows = [];
  const add = (label, key, d = 3) =>
    rows.push(
      `| ${label} | ${fmt(real[key], d)} | ${range(
        worlds.map((x) => x[key]),
        d,
      )} |`,
    );
  console.log(`\n### ${session}, scored 2008-${last}, ${nSeeds} worlds (mean [min, max])\n\n| | real | v2 worlds |\n| --- | --- | --- |`);
  add('ratings-alone loss, all pairs', 'all', 4);
  add('teammate pairs', 'mates', 4);
  add('other cars', 'cars', 4);
  add('calibration multiplier (fitted 2002-07)', 'mult');
  const sources = session === 'race' ? ['finish', 'paceW', 'pace', 'partial'] : ['qual'];
  for (const s of sources) {
    add(`loss, source ${s}`, `${s}.loss`, 4);
    add(`share of o = 1, source ${s}`, `${s}.o1`);
    add(`calibration slope, source ${s}`, `${s}.slope`, 2);
    rows.push(
      `| pairs of source ${s} | ${real[`${s}.n`]} | ${range(
        worlds.map((x) => x[`${s}.n`]),
        0,
      )} |`,
    );
  }
  if (session === 'race') {
    add('loss, dry', 'dry', 4);
    add('loss, wet', 'wet', 4);
  }
  console.log(rows.join('\n'));
  const cm = TAUS.map((_, i) => mean(curves.map((c) => c[i])));
  console.log(`\nlikelihood weight (loss at each, 2008-${last}; shipped ${session === 'race' ? 0.05 : 0.07}):\n`);
  console.log(`| tau | ${TAUS.join(' | ')} | best |\n| --- | ${TAUS.map(() => '---').join(' | ')} | --- |`);
  console.log(`| real | ${realCurve.map((v) => fmt(v, 4)).join(' | ')} | ${TAUS[realCurve.indexOf(Math.min(...realCurve))]} |`);
  console.log(`| v2 worlds (mean of ${nTau}) | ${cm.map((v) => fmt(v, 4)).join(' | ')} | ${TAUS[cm.indexOf(Math.min(...cm))]} |`);
  console.log(`| v2 worlds, best tau by world | ${curves.map((c) => TAUS[c.indexOf(Math.min(...c))]).join(', ')} | |`);
}
