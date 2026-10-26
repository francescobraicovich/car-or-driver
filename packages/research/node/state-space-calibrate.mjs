// Calibrates the state-space ratings and writes packages/core/src/presets/state-space-fit.js.
//
//   node packages/research/node/state-space-calibrate.mjs [--write]
//
// Everything it fits uses 2015 and earlier only:
//   slopes     one multiplier on the log-odds of each system's ratings-alone forecast (race and qualifying,
//              state-space and Elo), fitted on 2002-2007, so the live "ratings alone" diagnostics are honest;
//   scenario   the stretch applied to a what-if matchup (different cars, teammates) and the ratio for wet races,
//              fitted on finishing-order pairs of 2002-2015.
// It also prints the ratings-alone exam by window so the numbers in docs/state-space.md can be checked.
import { writeFileSync } from 'node:fs';
import { loadData } from './common.mjs';
import { collectExamWithElo } from '../../core/src/elo-benchmark.js';
import { runSession } from '../../core/src/state-space/build.js';
import { carIdentity } from '../../core/src/lineage.js';
import { hybridRatings } from '../../core/src/hybrid/ratings.js';
import { STATE_SPACE } from '../../core/src/presets/state-space.js';

const WRITE = process.argv.includes('--write');
const ctx = await loadData('data');
const { model, weekends } = collectExamWithElo(ctx.raw, ctx.lapSnapshots, ctx.maps, {}, ctx.lapPace);
const tmBoost = model.params.tmBoost;

const logit = (p) => Math.log(Math.min(1 - 1e-12, Math.max(1e-12, p)) / (1 - Math.min(1 - 1e-12, Math.max(1e-12, p))));
const nll = (z, o) => -Math.log(Math.min(1 - 1e-12, Math.max(1e-12, 1 / (1 + Math.exp(-(o ? z : -z))))));

// ---- flat observation tables: each carries the raw log-odds of both systems -----------------------------------
const rows = []; // { session, year, o, w, same, src, wet, zSS (variance-corrected), zPlain, zElo }
const qualRun = runSession(weekends, 'qual', tmBoost);
const raceRun = runSession(weekends, 'race', tmBoost, qualRun);
const hybrid = hybridRatings(weekends, model.snaps, raceRun, qualRun, carIdentity);
for (const session of ['race', 'qual']) {
  const hyper = STATE_SPACE[session];
  const k = Math.LN10 / hyper.s;
  const run = session === 'qual' ? qualRun : hybrid;
  weekends.forEach((w, i) => {
    const list = session === 'race' ? w.raceObs : w.qualObs;
    list.forEach((o, q) => {
      const mean = run.predictions[i].mean[q];
      const vari = run.predictions[i].vari[q];
      rows.push({
        session,
        year: w.year,
        o: o.o,
        w: o.w,
        same: o.same,
        src: o.src,
        wet: !!model.snaps[i].diag.wet,
        zSS: (k * mean) / Math.sqrt(1 + (Math.PI / 8) * k * k * vari),
        zPlain: k * mean,
        zElo: logit(o.pElo),
      });
    });
  });
}

/** One multiplier c minimising the weighted loss of c * z over the rows picked by `pick`. */
function slope(pick, key) {
  const sel = rows.filter(pick);
  let lo = 0.2;
  let hi = 3;
  const f = (c) => sel.reduce((a, r) => a + r.w * nll(c * r[key], r.o), 0);
  for (let i = 0; i < 40; i++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (f(a) < f(b)) hi = b;
    else lo = a;
  }
  return (lo + hi) / 2;
}
const inYears = (from, to) => (r) => r.year >= from && r.year <= to;
const fitWindow = (session) => (r) => r.session === session && r.year >= 2002 && r.year <= 2007;
const slopes = {
  race: slope(fitWindow('race'), 'zSS'),
  qual: slope(fitWindow('qual'), 'zSS'),
  eloRace: slope(fitWindow('race'), 'zElo'),
  eloQual: slope(fitWindow('qual'), 'zElo'),
};

// ---- what-if constants: finishing-order pairs of 2002-2015, plain ratings gap (a what-if has no variance) -------
const finish = (r) => r.session === 'race' && r.src === 'finish' && r.year >= 2002 && r.year <= 2015;
const scenario = {
  cars: slope((r) => finish(r) && !r.same, 'zPlain'),
  teammates: slope((r) => finish(r) && r.same, 'zPlain'),
};
const dryCars = slope((r) => finish(r) && !r.same && !r.wet, 'zPlain');
const wetCars = slope((r) => finish(r) && !r.same && r.wet, 'zPlain');
scenario.wetRatio = wetCars / dryCars;
const round = (v) => +v.toFixed(4);
const fit = {
  slopes: Object.fromEntries(Object.entries(slopes).map(([k, v]) => [k, round(v)])),
  scenario: Object.fromEntries(Object.entries(scenario).map(([k, v]) => [k, round(v)])),
};
console.log('slopes (fitted on 2002-2007):', JSON.stringify(fit.slopes));
console.log(
  'what-if constants (finishing pairs 2002-2015):',
  JSON.stringify(fit.scenario),
  `wet ${wetCars.toFixed(3)} vs dry ${dryCars.toFixed(3)} (${rows.filter((r) => finish(r) && r.wet).length} wet pairs)`,
);

// ---- the ratings-alone exam by window ---------------------------------------------------------------------------
const loss = (pick, key, c) => {
  const sel = rows.filter(pick);
  return sel.reduce((a, r) => a + r.w * nll(c(r) * r[key], r.o), 0) / sel.reduce((a, r) => a + r.w, 0);
};
const cSS = (r) => fit.slopes[r.session];
const cElo = (r) => fit.slopes[r.session === 'race' ? 'eloRace' : 'eloQual'];
console.log('\nratings-alone exam (weighted log-loss; lower is better)');
console.log(
  'window'.padEnd(12) +
    ['Elo comb.', 'SS comb.', 'Elo race', 'SS race', 'Elo qual', 'SS qual', 'Elo mates', 'SS mates', 'Elo cars', 'SS cars']
      .map((s) => s.padStart(11))
      .join(''),
);
for (const [label, from, to] of [
  ['2002-2007', 2002, 2007],
  ['2008-2011', 2008, 2011],
  ['2012-2015', 2012, 2015],
  ['2016-now', 2016, 9999],
]) {
  const p = inYears(from, to);
  const cells = [
    loss(p, 'zElo', cElo),
    loss(p, 'zSS', cSS),
    loss((r) => p(r) && r.session === 'race', 'zElo', cElo),
    loss((r) => p(r) && r.session === 'race', 'zSS', cSS),
    loss((r) => p(r) && r.session === 'qual', 'zElo', cElo),
    loss((r) => p(r) && r.session === 'qual', 'zSS', cSS),
    loss((r) => p(r) && r.same, 'zElo', cElo),
    loss((r) => p(r) && r.same, 'zSS', cSS),
    loss((r) => p(r) && !r.same, 'zElo', cElo),
    loss((r) => p(r) && !r.same, 'zSS', cSS),
  ];
  console.log(label.padEnd(12) + cells.map((v) => v.toFixed(4).padStart(11)).join(''));
}

if (WRITE) {
  const text = `// GENERATED by packages/research/node/state-space-calibrate.mjs from STATE_SPACE (state-space.js): do not edit by hand.
//
// slopes    one multiplier on the log-odds of each system's ratings-alone forecast, fitted on 2002-2007, so the
//           live ratings-alone diagnostics need no refitting.
// scenario  what-if matchups: the stretch of the log-odds for different cars and for teammates, and the ratio
//           applied in the wet. Fitted on finishing-order pairs of 2002-2015.
export const STATE_SPACE_FIT = ${JSON.stringify(fit, null, 2)};
`;
  writeFileSync(new URL('../../core/src/presets/state-space-fit.js', import.meta.url), text);
  console.log('\nwrote packages/core/src/presets/state-space-fit.js');
}
