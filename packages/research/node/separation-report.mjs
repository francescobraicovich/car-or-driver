// The separation scorecard of one or more named points, next to the predictive scores they must not give up.
//
//   node packages/research/node/separation-report.mjs [--points baseline,prev-final] [--last 2011] [--json out.json]
//   node packages/research/node/separation-report.mjs --settings '{"race":{"tau":0.03},"qual":{}}' --last 2011
//
// Points are overrides of the BASELINE settings (the presets before the first hill climb): `baseline`, `prev-final` (the first climb's final
// point, not shipped), or a JSON dict. --last 2011 (default) cuts the timeline before any filter runs; --last 2015 reads the confirmation years.
import { writeFileSync } from 'node:fs';
import { loadData } from './common.mjs';
import { evaluateModel, stateSpaceRun, truncateTimeline } from '../../eval/src/index.js';
import { prepareReal } from '../../eval/src/pipeline.js';
import { separationScore, H_MOVER, H_STAYER, H_LEAK, H_FROZEN } from './separation.mjs';

export const BASELINE = {
  race: {
    tau: 0.05,
    winterC: 11.379153390987709,
    sdNew: 20,
    sdA: 5,
    rhoA: 0.8,
    rateA: true,
    sdC: 26.923076923076923,
    mMover: 1,
    tauWet: 1,
    varInfl: 1,
  },
  qual: {},
};
export const POINTS = {
  baseline: {},
  'prev-final': {
    race: { tau: 0.025510204081632657, winterC: 8.753194916144391, sdNew: 15.384615384615383, sdA: 3.3333333333333335 },
    qual: {},
  },
  'new-final': {
    race: { tau: 0.03571428571428572, mMover: 0.5, sdNew: 15.3846, sdC: 35, tauWet: 0.7142857142857143 },
    qual: {},
  },
};

const argv = process.argv.slice(2);
const opt = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? dflt : argv[i + 1];
};

export const merge = (point) => ({
  race: { ...BASELINE.race, ...(point.race ?? {}) },
  qual: { ...BASELINE.qual, ...(point.qual ?? {}) },
});

/** Evaluate settings (full, already merged with the baseline) on a timeline: the harness result and the separation scorecard. */
export function evaluatePoint(prep, timeline, settings) {
  const runs = {
    race: stateSpaceRun(timeline, 'race', prep.ctx, settings.race),
    qual: stateSpaceRun(timeline, 'qual', prep.ctx, settings.qual),
  };
  const res = evaluateModel(timeline, prep.identity, runs, { boot: { B: 50 } });
  return { res, runs, sep: separationScore(res, timeline, prep.identity, runs) };
}

const f = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');

export function printScore(label, sep) {
  console.log(`\n== ${label}: D2 ${f(sep.D2)}  (race ${f(sep.race.D)}, qualifying ${f(sep.qual.D)})`);
  console.log('session  T1 mover swing  T2 stayer swing  T3 stayer leak  T4 frozen transfer');
  for (const s of ['race', 'qual'])
    console.log(
      `${s.padEnd(8)} ${f(sep[s].T1).padStart(13)} ${f(sep[s].T2).padStart(15)} ${f(sep[s].T3).padStart(14)} ${f(sep[s].T4).padStart(18)}`,
    );
  for (const s of ['race', 'qual']) {
    const r = sep[s].raw;
    console.log(
      `  ${s}: mover/control swing ` +
        H_MOVER.map((K) => `k${K} ${f(r.mover[K], 2)}`).join(' ') +
        ` | stayer/control ` +
        H_STAYER.map((K) => `k${K} ${f(r.stayer[K], 2)}`).join(' ') +
        ` | leak (slope, in control swings) ` +
        H_LEAK.map((K) => `k${K} ${f(r.leak[K].slope, 3)}, ${f(r.leak[K].units, 2)}`).join(' ') +
        ` | frozen mover/stayer slope ` +
        H_FROZEN.map((K) => `k${K} ${f(r.frozen[K].movers, 2)}/${f(r.frozen[K].stayers, 2)}=${f(r.frozen[K].ratio, 2)}`).join(' '),
    );
  }
}

if (process.argv[1]?.endsWith('separation-report.mjs')) {
  const last = +opt('last', 2011);
  const data = await loadData(new URL('../../../data', import.meta.url).pathname);
  const prep = prepareReal(data, { holdout: false });
  const timeline = truncateTimeline(prep.timeline, last);
  const points = opt('settings')
    ? { custom: JSON.parse(opt('settings')) }
    : Object.fromEntries(
        String(opt('points', 'baseline,prev-final'))
          .split(',')
          .map((p) => [p, POINTS[p]]),
      );
  const out = {};
  for (const [name, point] of Object.entries(points)) {
    const { res, sep } = evaluatePoint(prep, timeline, merge(point));
    printScore(name, sep);
    const table = Object.fromEntries(
      res.predictive.table.map((t) => [`${t.window}.${t.pair}`, { race: t.race.loss, qual: t.qual.loss, combined: t.combined }]),
    );
    out[name] = { sep, loss: table };
  }
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify(out));
}
