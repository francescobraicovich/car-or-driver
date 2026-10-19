// Scores race configurations on drivers in a new car with the rating posted BEFORE the move (mover-strict.mjs), next to the pooled loss.
//   node packages/research/node/strict-eval.mjs [--last 2011|2015] [--configs base,shipped,...] [--json out]
import { writeFileSync } from 'node:fs';
import { loadData } from './common.mjs';
import { findMoves, fitSlope, indexTimeline, observationRows, truncateTimeline, stateSpaceRun } from '../../eval/src/index.js';
import { prepareReal } from '../../eval/src/pipeline.js';
import { merge } from './separation-report.mjs';
import { scorePoint, summarise } from './cross-session.mjs';
import { strictScores } from './mover-strict.mjs';
import { arrivalOffsets } from '../../core/src/state-space/qualifying-link.js';

export const SHIPPED = { sdA: 12, rhoA: 0.97, tau: 0.038461538461538464, sdNew: 9.103322712790167, winterC: 8.753194916144391 };
export const FINAL = { beta: 0.4, gamma: 0.3, race: { ...SHIPPED, rateA: false } };
export const CONFIGS = {
  final: FINAL,
  prev: { beta: 0.4, gamma: 0.3, race: { ...SHIPPED, sdA: 8, rateA: false } },
  'final+adapt': { ...FINAL, adapt: { dip: 20, rho: 0.5 } },
  base: { beta: 0, gamma: 0, race: {} },
  shipped: { beta: 0.3, gamma: 0.3, race: SHIPPED },
  'shipped-hideA': { beta: 0.3, gamma: 0.3, race: { ...SHIPPED, rateA: false } },
  noA: { beta: 0.3, gamma: 0.3, race: { ...SHIPPED, sdA: 0, rateA: false } },
  'link-oldA': { beta: 0.3, gamma: 0.3, race: { ...SHIPPED, sdA: 5, rhoA: 0.8, rateA: false } },
};
const argv = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i < 0 ? d : argv[i + 1];
};
const f = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');

export async function load(last, holdout = false) {
  const data = await loadData(new URL('../../../data', import.meta.url).pathname);
  const prep = prepareReal(data, { holdout });
  const timeline = truncateTimeline(prep.timeline, last);
  const idx = indexTimeline(timeline, prep.ctx);
  const base = merge({});
  return { prep, timeline, idx, base, moves: findMoves(idx) };
}

/** Everything about one config: pooled loss windows, scorecard, strict mover scores by window of the move. */
export function evalConfig(env, cfg, qualRun) {
  const { prep, timeline, idx, base, moves } = env;
  const { res, runs, sep } = scorePoint(
    prep,
    timeline,
    qualRun,
    { ...base.race, ...cfg.race },
    cfg.beta,
    30,
    cfg.gamma,
    qualRun,
    cfg.adapt ?? null,
  );
  const { loss } = summarise(res);
  const run = runs.race;
  const rows = observationRows(idx, run).filter((r) => r.year >= 2002 && r.year <= 2007 && !r.same);
  const c = fitSlope(rows);
  const adaptMaps = arrivalOffsets(timeline, prep.ctx.canon, cfg.adapt ?? null);
  const strict = strictScores(idx, run, Number.isFinite(c) ? c : 1, {
    moves,
    adapt: adaptMaps,
    windows: [
      ['2002-11', 2002, 2011],
      ['2012-15', 2012, 2015],
      ['2016+', 2016, 9999],
    ],
  });
  return { res, loss, sep, strict, c, runs };
}

if (process.argv[1]?.endsWith('strict-eval.mjs')) {
  const last = +opt('last', 2015);
  const env = await load(last, last > 2015);
  const qualRun = stateSpaceRun(env.timeline, 'qual', env.prep.ctx, env.base.qual);
  const names = String(opt('configs', 'base,shipped,shipped-hideA,noA,link-oldA')).split(',');
  const out = {};
  for (const name of names) {
    const cfg = CONFIGS[name] ?? JSON.parse(name);
    const r = evalConfig(env, cfg, qualRun);
    out[name] = { loss: r.loss, strict: r.strict, D2: r.sep.D2 };
    console.log(
      `\n== ${name}  P-windows: fit ${f(r.loss['fit.combined.all'])} w2 ${f(r.loss['w2.combined.all'])} w3 ${f(r.loss['w3.combined.all'])}  mates w2 ${f(r.loss['w2.combined.mates'])} w3 ${f(r.loss['w3.combined.mates'])}  D2 ${f(r.sep.D2, 3)}`,
    );
    for (const key of Object.keys(r.strict))
      if (key.endsWith('k5') || key.endsWith('k10')) {
        const s = r.strict[key];
        console.log(
          `  ${key.padEnd(9)} teammates n ${String(s.nTm).padStart(4)} loss ${f(s.tmLoss)} slope ${f(s.tmSlope, 2)} (stayers ${f(s.stSlope, 2)}) | field n ${String(s.nFd).padStart(5)} loss ${f(s.fdLoss)} slope ${f(s.fdSlope, 2)}`,
        );
      }
  }
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify(out, null, 1));
}
