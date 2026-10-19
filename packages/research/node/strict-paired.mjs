// Paired difference (final minus baseline) of the strict frozen losses of movers, bootstrapped over MOVES (a mover's duels are one cluster).
//   node packages/research/node/strict-paired.mjs [--holdout]   (2016+ rows appear only with --holdout and are a second look: see Amendment 4)
import { stateSpaceRun, clusterBootstrap } from '../../eval/src/index.js';
import { load, FINAL } from './strict-eval.mjs';
import { scorePoint } from './cross-session.mjs';
import { strictItems, strictStayers, lossOf } from './mover-strict.mjs';
import { logisticCalibration } from '../../eval/src/index.js';
import { BASELINE } from './separation-report.mjs';

const holdout = process.argv.includes('--holdout');
const env = await load(holdout ? 9999 : 2015, holdout);
const qual = stateSpaceRun(env.timeline, 'qual', env.prep.ctx, env.base.qual);
const run = (cfg) => scorePoint(env.prep, env.timeline, qual, { ...env.base.race, ...cfg.race }, cfg.beta, 5, cfg.gamma).runs.race;
const runs = { base: run({ beta: 0, gamma: 0, race: BASELINE.race }), final: run(FINAL) };
const cal = (it) =>
  logisticCalibration(
    it.map((r) => r.z),
    it.map((r) => r.o),
    it.map((r) => r.w),
    { intercept: false },
  ).b;
const f = (v) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(4) : 'n/a');
const wins = [
  ['2002-2011', 2002, 2011],
  ['2012-2015', 2012, 2015],
  ...(holdout ? [['2016+ (second look)', 2016, 9999]] : []),
  ['all', 0, 9999],
];
for (const K of [5, 10]) {
  const it = Object.fromEntries(Object.keys(runs).map((w) => [w, strictItems(env.idx, runs[w], env.moves, K)]));
  const c = Object.fromEntries(Object.keys(runs).map((w) => [w, cal(strictStayers(env.idx, runs[w], K))]));
  const cField = 1; // the run's own multiplier cancels in a pair only approximately; report the field at the shipped multipliers
  for (const [name, y0, y1] of wins) {
    for (const kind of ['tm', 'fd']) {
      const pairs = it.base
        .map((b, i) => ({ b, s: it.final[i] }))
        .filter((p) => p.b.kind === kind && p.b.year >= y0 && p.b.year <= y1 && p.s?.kind === kind);
      const cb = kind === 'tm' ? c.base : cField;
      const cs = kind === 'tm' ? c.final : cField;
      const d = clusterBootstrap(
        pairs,
        (p) => `${p.b.driverId}@${p.b.t0}`,
        (ps) =>
          lossOf(
            ps.map((p) => p.s),
            (r) => cs * r.z,
          ) -
          lossOf(
            ps.map((p) => p.b),
            (r) => cb * r.z,
          ),
        { B: 500 },
      );
      console.log(
        `${name.padEnd(20)} k${K} ${kind === 'tm' ? 'teammates' : 'field    '} duels ${String(pairs.length).padStart(5)} moves ${String(d.clusters).padStart(3)}  loss final - baseline ${f(d.est)}  [${f(d.lo)}, ${f(d.hi)}]`,
      );
    }
  }
}
