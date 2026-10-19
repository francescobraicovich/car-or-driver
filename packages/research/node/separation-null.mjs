// The floor of the separation scorecard: what a CORRECT filter scores on it. A synthetic world is drawn from known dynamics (the baseline's own
// settings, so it has a jump and a fading transient at a team change of the size the baseline assumes, and nothing else that depends on the
// team), on the real calendar; every candidate runs on it and is scored with the terms of separation.mjs. The reading of the filter that is
// right for the world is the lowest D2 one can expect there; the candidates' readings show how far each is from it.
//
//   node packages/research/node/separation-null.mjs [--points baseline,prev-final,new-final] [--seeds 4] [--last 2011] [--v2]
//
// `correct` = the baseline's own settings with the likelihood weight tuned to the world (the null T of the harness). `--v2` draws the world
// from Simulator v2 (informational: it does not pass its realism checks, docs/evaluation.md).
import { loadData } from './common.mjs';
import {
  STATE_SPACE_DEFAULTS,
  WINDOWS,
  catalogue,
  fitSlope,
  indexTimeline,
  observationRows,
  stateSpaceRun,
  structuralMetrics,
  syntheticWorld,
  truncateTimeline,
  tuneTau,
  worldFromHyper,
  worldParamsV2,
  mean,
} from '../../eval/src/index.js';
import { prepareReal } from '../../eval/src/pipeline.js';
import { STATE_SPACE } from '../../core/src/presets/state-space.js';
import { sessionTerms } from './separation.mjs';
import { POINTS, merge } from './separation-report.mjs';

const argv = process.argv.slice(2);
const opt = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? dflt : argv[i + 1];
};
const nSeeds = +opt('seeds', 4);
const last = +opt('last', 2011);
const v2 = argv.includes('--v2');
const names = String(opt('points', 'baseline,prev-final,new-final,correct')).split(',');

const data = await loadData(new URL('../../../data', import.meta.url).pathname);
const prep = prepareReal(data, { holdout: false });
const timeline = truncateTimeline(prep.timeline, last);
const idx0 = indexTimeline(timeline, prep.ctx);

const TERMS = ['T1', 'T2', 'T3', 'T4'];
const table = {};
for (const session of ['race', 'qual']) {
  const base = merge({})[session];
  const hyperWorld = { ...STATE_SPACE_DEFAULTS, ...STATE_SPACE[session], ...base };
  const worldParams = v2 ? worldParamsV2(worldFromHyper, {}, { version: 2 }) : worldFromHyper(hyperWorld);
  const tuned = tuneTau(timeline, prep.ctx, { session, hyper: base, worldParams });
  for (const name of names) {
    const settings = name === 'correct' ? { ...base, tau: tuned.tau } : merge(POINTS[name])[session];
    const reps = [];
    for (let seed = 1; seed <= nSeeds; seed++) {
      const w = syntheticWorld(timeline, idx0, session, worldParams, seed);
      const idx = indexTimeline(w.timeline, prep.ctx);
      const events = catalogue(idx);
      const run = stateSpaceRun(w.timeline, session, prep.ctx, settings, 'synthetic');
      const fitRows = observationRows(idx, run).filter((r) => r.year >= WINDOWS[0].from && r.year <= WINDOWS[0].to);
      const calib = fitSlope(fitRows);
      const structural = structuralMetrics(idx, run, events, { calib: Number.isFinite(calib) ? calib : 1, boot: { B: 5 } });
      const t = sessionTerms({ sessions: { [session]: structural } }, session, idx, run, events);
      reps.push({
        ...Object.fromEntries(TERMS.map((k) => [k, t[k]])),
        D: t.D,
        mover1: t.raw.mover[1],
        mover5: t.raw.mover[5],
        frozen5: t.raw.frozen[5].ratio,
      });
    }
    table[`${session}.${name}`] = Object.fromEntries(Object.keys(reps[0]).map((k) => [k, mean(reps.map((r) => r[k]))]));
  }
  console.log(`${session}: world drawn from the baseline settings (${v2 ? 'v2' : 'v1'}); tuned tau of the correct filter ${tuned.tau}`);
}
console.log(`\nmean over ${nSeeds} worlds, timeline through ${last}`);
console.log('point                    D_session     T1     T2     T3     T4   | mover swing k1  k5 | frozen ratio k5');
for (const [k, v] of Object.entries(table))
  console.log(
    `${k.padEnd(24)} ${v.D.toFixed(3).padStart(9)} ${TERMS.map((t) => v[t].toFixed(3).padStart(6)).join(' ')}   | ${v.mover1.toFixed(2).padStart(14)} ${v.mover5.toFixed(2).padStart(5)} | ${v.frozen5.toFixed(2).padStart(10)}`,
  );
