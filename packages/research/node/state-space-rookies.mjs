// How new drivers enter the state-space ratings (docs/state-space.md).
//
//   node packages/research/node/state-space-rookies.mjs scan               grid of rookie settings, both sessions
//   node packages/research/node/state-space-rookies.mjs fit                coordinate search on 2002-2011, validated on 2012-2015
//   node packages/research/node/state-space-rookies.mjs report '<json>'    one setting, full slices, 2016+ shown as a second look
//
// The ratings-alone exam on the usual windows plus rookie slices: pairs involving a driver in his first 5 races, in
// races 6-10, a rookie against his teammate, a rookie against other teams, and everyone else. A "rookie" is a driver
// who first appears after the first season of data. 2016 onward is never used to choose anything here.
import { loadData } from './common.mjs';
import { ssContext } from '../../core/src/state-space/build.js';
import { collectExam } from '../../core/src/state-space/exam.js';
import { runStateSpace } from '../../core/src/state-space/filter.js';
import { STATE_SPACE } from '../../core/src/presets/state-space.js';

const mode = process.argv[2] || 'scan';
const ctx = await loadData('data');
const { model, weekends } = collectExam(ctx.raw, ctx.lapSnapshots, ctx.maps, {}, ctx.lapPace);
const tmBoost = model.params.tmBoost;
const SECOND_LOOK = mode === 'report' || process.env.SECOND_LOOK === '1'; // 2016+ is only displayed in `report`, labelled as not independent
const usable = weekends.filter((w) => SECOND_LOOK || w.year <= 2015);
const firstYear = weekends[0].year;

// appearances before each weekend and the debut year, for the rookie slices
const seen = new Map();
const debut = new Map();
const flags = usable.map((w) => {
  const rows = new Map();
  for (const r of w.rows) {
    if (!debut.has(r.driverId)) debut.set(r.driverId, w.year);
    rows.set(r.driverId, { n: seen.get(r.driverId) || 0, rookie: debut.get(r.driverId) > firstYear });
  }
  for (const r of w.rows) seen.set(r.driverId, (seen.get(r.driverId) || 0) + 1);
  return rows;
});

const nll = (z, o) => -Math.log(Math.min(1 - 1e-12, Math.max(1e-12, 1 / (1 + Math.exp(-(o ? z : -z))))));
const SLICES = {
  all: () => true,
  'first 5 races': (a, b) => (a.rookie && a.n < 5) || (b.rookie && b.n < 5),
  'races 6-10': (a, b) => !((a.rookie && a.n < 5) || (b.rookie && b.n < 5)) && ((a.rookie && a.n < 10) || (b.rookie && b.n < 10)),
  'rookie vs teammate': (a, b, o) => o.same && ((a.rookie && a.n < 5) || (b.rookie && b.n < 5)),
  'rookie vs other teams': (a, b, o) => !o.same && ((a.rookie && a.n < 5) || (b.rookie && b.n < 5)),
  veterans: (a, b) => !((a.rookie && a.n < 10) || (b.rookie && b.n < 10)),
};

/** Ratings-alone forecasts of every observation for one session: [{ z, o, w, year, slice flags }]. */
function items(session, hyper, until = 9999) {
  const part = usable.filter((w) => w.year <= until); // the filter is causal, so a prefix gives identical ratings
  const run = runStateSpace(
    part.map((w) => ({ year: w.year, rows: w.rows, obs: session === 'race' ? w.raceObs : w.qualObs })),
    hyper,
    ssContext(tmBoost),
  );
  const k = Math.LN10 / hyper.s;
  const out = [];
  part.forEach((w, i) => {
    (session === 'race' ? w.raceObs : w.qualObs).forEach((o, q) => {
      const a = flags[i].get(o.x) || { n: 99, rookie: false };
      const b = flags[i].get(o.y) || { n: 99, rookie: false };
      const z = (k * run.predictions[i].mean[q]) / Math.sqrt(1 + (Math.PI / 8) * k * k * run.predictions[i].vari[q]);
      out.push({ z, o: o.o, w: o.w, year: w.year, a, b, same: o.same });
    });
  });
  return out;
}

function slope(list) {
  let lo = 0.2;
  let hi = 3;
  const f = (c) => list.reduce((s, r) => s + r.w * nll(c * r.z, r.o), 0);
  for (let i = 0; i < 30; i++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (f(a) < f(b)) hi = b;
    else lo = a;
  }
  return (lo + hi) / 2;
}
const WINDOWS = { '2002-07': [2002, 2007], '2008-11': [2008, 2011], '2012-15': [2012, 2015], '2016+ (second look)': [2016, 9999] };
const loss = (list, c, pick) => {
  let l = 0;
  let w = 0;
  for (const r of list)
    if (pick(r)) {
      l += r.w * nll(c * r.z, r.o);
      w += r.w;
    }
  return w ? l / w : NaN;
};

/** Score one setting (applied to both sessions): slices by window. */
function evaluate(setting) {
  const result = {};
  for (const session of ['race', 'qual']) {
    const list = items(session, { ...STATE_SPACE[session], ...setting[session] });
    const c = slope(list.filter((r) => r.year >= 2002 && r.year <= 2007));
    result[session] = Object.fromEntries(
      Object.entries(WINDOWS).map(([name, [from, to]]) => [
        name,
        Object.fromEntries(
          Object.entries(SLICES).map(([s, pick]) => [
            s,
            loss(list, c, (r) => r.year >= from && r.year <= to && r.year >= 2002 && pick(r.a, r.b, r)),
          ]),
        ),
      ]),
    );
  }
  return result;
}
const f4 = (v) => (Number.isFinite(v) ? v.toFixed(4) : '  n/a ');
const both = (s) => ({ race: s, qual: s });

/** Rows of [name, setting]; prints the change in loss against the shipped settings (race | qualifying), 2008-11 and 2012-15 pooled. */
function table(rows) {
  const base = evaluate(both({}));
  const cols = ['all', 'first 5 races', 'races 6-10', 'rookie vs teammate', 'rookie vs other teams'];
  const mean = (xs) => xs.reduce((a, c) => a + c, 0) / xs.length;
  const level = (r, session, slice) => mean(['2008-11', '2012-15'].map((w) => r[session][w][slice]));
  console.log('change in loss vs shipped, race | qualifying (negative is better); shipped level in the first row');
  console.log('setting'.padEnd(46) + cols.map((s) => s.padStart(24)).join(''));
  console.log(
    'shipped (level)'.padEnd(46) + cols.map((s) => `${f4(level(base, 'race', s))} | ${f4(level(base, 'qual', s))}`.padStart(24)).join(''),
  );
  for (const [name, setting] of rows) {
    const r = evaluate(setting);
    const d = (session, slice) => {
      const v = level(r, session, slice) - level(base, session, slice);
      return `${v >= 0 ? '+' : ''}${v.toFixed(4)}`;
    };
    console.log(name.padEnd(46) + cols.map((s) => `${d('race', s)} | ${d('qual', s)}`.padStart(24)).join(''));
  }
}

if (mode === 'scan') {
  const rows = [];
  for (const sdRel of [5, 10, 15, 25])
    for (const muRel of [0, -8]) rows.push([`anchor sd ${sdRel} mean ${muRel}`, both({ sdRel, muRel, relStart: 1 })]);
  for (const m of [0.5, 0.2, 0]) rows.push([`other-team weight x${m} in a rookie's first 5`, both({ mRookieCross: m })]);
  table(rows);
}

if (mode === 'scan2') {
  const rows = [];
  for (const muNew of [0, -8, -15, -25]) rows.push([`field-relative start, offset ${muNew}`, both({ relStart: 1, muNew })]);
  for (const muNew of [-15, -25]) rows.push([`field-relative start, offset ${muNew}, sd 30`, both({ relStart: 1, muNew, sdNew: 30 })]);
  for (const sdRel of [10, 15, 25])
    for (const muRel of [-12, -20, -30]) rows.push([`anchored sd ${sdRel} mean ${muRel}`, both({ sdRel, muRel, relStart: 1 })]);
  table(rows);
}

const FIT_TO = +(process.argv[4] || 2007); // last year the fit may read
if (mode === 'fit') {
  // Fit the start (offset from the field average, and spread) on 2002-2007, per session, minimising the all-pairs loss plus the
  // loss on pairs involving a rookie in his first 10 races; then show every slice on the later windows separately.
  const R10 = (a, b) => (a.rookie && a.n < 10) || (b.rookie && b.n < 10);
  const objective = (session, hyper) => {
    const list = items(session, hyper, FIT_TO).filter((r) => r.year >= 2002);
    const c = slope(list);
    return loss(list, c, () => true) + loss(list, c, (r) => R10(r.a, r.b));
  };
  const fitted = {};
  for (const session of ['race', 'qual']) {
    // `fit` searches the start (offset from the field average, spread); `fit dip` searches the fading debut adjustment
    const DIP = process.argv[3] === 'dip';
    let h = DIP ? { dipR: 20, sdR: 20, rhoR: 0.8 } : { relStart: 1, muNew: -25, sdNew: STATE_SPACE[session].sdNew };
    const full = (x) => ({ ...STATE_SPACE[session], ...x });
    let best = objective(session, full(h));
    console.error(`${session}: start J=${best.toFixed(5)}`);
    const spec = DIP
      ? [
          ['dipR', 5, 0, 80, true],
          ['sdR', 1.25, 3, 60, false],
          ['rhoR', 0.05, 0.3, 0.97, true],
        ]
      : [
          ['muNew', 5, -100, 0, true],
          ['sdNew', 1.25, 5, 60, false],
        ];
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (const [key, step, lo, hi, additive] of spec) {
        for (const dir of [1, -1]) {
          for (let tries = 0; tries < 8; tries++) {
            const v = additive ? h[key] + dir * step : dir > 0 ? h[key] * step : h[key] / step;
            if (v < lo || v > hi) break;
            const r = objective(session, full({ ...h, [key]: v }));
            if (r < best - 1e-6) {
              best = r;
              h = { ...h, [key]: v };
              improved = true;
            } else break;
          }
        }
      }
      console.error(`  pass ${pass + 1}: J=${best.toFixed(5)} ${JSON.stringify(h)}`);
      if (!improved) break;
    }
    fitted[session] = h;
  }
  console.log('fitted:', JSON.stringify(fitted));
  const base = evaluate(both({}));
  const r = evaluate(fitted);
  const cols = Object.keys(SLICES);
  for (const session of ['race', 'qual'])
    for (const w of ['2002-07', '2008-11', '2012-15']) {
      console.log(
        `${session} ${w}`.padEnd(16) +
          cols
            .map((s) =>
              `${s} ${f4(base[session][w][s])} -> ${f4(r[session][w][s])} (${(r[session][w][s] - base[session][w][s] >= 0 ? '+' : '') + (r[session][w][s] - base[session][w][s]).toFixed(4)})`.padEnd(
                46,
              ),
            )
            .join(''),
      );
    }
}

if (mode === 'scan4') {
  // the shipped start, plus a temporary debut adjustment that fades
  const rows = [];
  for (const rhoR of [0.75, 0.9])
    for (const sdR of [10, 20])
      for (const dipR of [10, 20, 30]) rows.push([`debut dip ${dipR}, sd ${sdR}, fades x${rhoR}`, both({ dipR, sdR, rhoR })]);
  table(rows);
}

if (mode === 'scan3') {
  const rows = [];
  for (const muNew of [-25, -32, -40, -50])
    for (const sdNew of [12, 20, 28])
      rows.push([`field-relative start, offset ${muNew}, sd ${sdNew}`, both({ relStart: 1, muNew, sdNew })]);
  for (const muRel of [-25, -35, -45])
    for (const sdRel of [15, 25])
      rows.push([`teammate-anchored, gap ${muRel}, sd ${sdRel}`, both({ relStart: 1, sdRel, muRel, muNew: -25 })]);
  table(rows);
}

if (mode === 'report') {
  const setting = JSON.parse(process.argv[3] || '{}');
  const r = evaluate(setting.race || setting.qual ? setting : both(setting));
  for (const session of ['race', 'qual']) {
    console.log(`\n${session}: ratings-alone loss by slice`);
    console.log(
      'window'.padEnd(24) +
        Object.keys(SLICES)
          .map((s) => s.padStart(22))
          .join(''),
    );
    for (const w of Object.keys(WINDOWS))
      console.log(
        w.padEnd(24) +
          Object.keys(SLICES)
            .map((s) => f4(r[session][w][s]).padStart(22))
            .join(''),
      );
  }
}

if (mode === 'delta') {
  // usage: delta '<json array of settings>' : change in loss against the shipped settings, window by window (race | qualifying)
  const base = evaluate(both({}));
  const cols = ['all', 'first 5 races', 'races 6-10', 'rookie vs teammate', 'veterans'];
  for (const setting of JSON.parse(process.argv[3])) {
    const r = evaluate(setting.race || setting.qual ? setting : both(setting));
    console.log(`\n${JSON.stringify(setting)}`);
    console.log('window'.padEnd(10) + cols.map((s) => s.padStart(22)).join(''));
    for (const w of ['2002-07', '2008-11', '2012-15', '2016+ (second look)']) {
      const cell = (slice) => {
        const d = (session) =>
          `${r[session][w][slice] - base[session][w][slice] >= 0 ? '+' : ''}${(r[session][w][slice] - base[session][w][slice]).toFixed(4)}`;
        return `${d('race')} | ${d('qual')}`.padStart(22);
      };
      console.log(w.slice(0, 7).padEnd(10) + cols.map(cell).join(''));
    }
  }
}
