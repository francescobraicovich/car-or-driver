// How the forecast heads behave on the metric suite (docs/metrics.md, section "forecast layer"): the ratings-alone probability, the Thursday head and the race-day
// head (and the qualifying head) of the SHIPPED model, per observation, scored by window and pair type, calibrated, and on drivers in a new car.
//   node packages/research/node/heads-metrics.mjs [--holdout]   > research/eval/heads-metrics.txt
// Windows through 2015 only unless --holdout (2016+ is then a labelled second look).
import { writeFileSync } from 'node:fs';
import { loadData } from './common.mjs';
import { findMoves, indexTimeline } from '../../eval/src/index.js';
import { prepareReal } from '../../eval/src/pipeline.js';
import { runSession } from '../../core/src/state-space/build.js';
import { replayForecastLayer } from '../../core/src/state-space/replay.js';
import { STATE_SPACE_HEADS } from '../../core/src/state-space/forecast-heads.js';
import { logit } from './diagnostics-library.mjs';

const hold = process.argv.includes('--holdout');
const data = await loadData(new URL('../../../data', import.meta.url).pathname);
const prep = prepareReal(data, { holdout: hold });
const n = prep.n;
const weekends = prep.weekends.slice(0, n);
const tm = prep.model.params.tmBoost;
const qual = runSession(weekends, 'qual', tm);
const race = runSession(weekends, 'race', tm, qual);
const index = new Map(weekends.map((w, i) => [String(w.info.raceId), i]));

// ---- one record per observation: ratings-alone probability (with the hazard mix), Thursday head, race-day head, qualifying head
const rows = [];
replayForecastLayer(
  weekends,
  { race: race.pre, qual: qual.pre },
  {
    lapPace: data.lapPace,
    params: prep.model.params,
    heads: STATE_SPACE_HEADS,
    onRow: ({ info, session, ob, weight, base, predicted }) => {
      rows.push({
        i: index.get(String(info.raceId)),
        year: +info.year,
        session,
        x: String(ob.x.driverId),
        y: String(ob.y.driverId),
        o: ob.obs,
        w: weight,
        base,
        thu: session === 'race' ? predicted.pre : null,
        raceDay: session === 'race' ? predicted.post : null,
        qualHead: session === 'qual' ? predicted.qual : null,
        same: ob.x.constructorId === ob.y.constructorId,
      });
    },
  },
);
const f = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
const nll = (p, o) => -Math.log(Math.max(1e-12, o ? p : 1 - p));
const wl = (rs, key) => {
  let s = 0;
  let w = 0;
  for (const r of rs) {
    if (r[key] == null) continue;
    s += r.w * nll(r[key], r.o);
    w += r.w;
  }
  return w ? s / w : NaN;
};
const lg = (p) => Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)) / (1 - Math.min(1 - 1e-9, Math.max(1e-9, p))));
const WINS = [['2008-11', 2008, 2011], ['2012-15', 2012, 2015], ...(hold ? [['2016+ (second look)', 2016, 9999]] : [])];
const inW = (w) => (r) => r.year >= w[1] && r.year <= w[2];
console.log(`# Forecast heads of the shipped model on the metric suite (${hold ? 'with 2016+ as a second look' : 'through 2015'})`);
console.log(
  '\n## H1. Log-loss by window and pair type (race observations): ratings alone (+ hazard mix) | Thursday head | race-day head. Coin 0.6931.',
);
for (const w of WINS)
  for (const [pn, pf] of [
    ['all', () => true],
    ['teammates', (r) => r.same],
    ['other cars', (r) => !r.same],
  ]) {
    const rs = rows.filter((r) => r.session === 'race' && inW(w)(r) && pf(r));
    console.log(`${w[0].padEnd(20)} ${pn.padEnd(11)} ${f(wl(rs, 'base'))} | ${f(wl(rs, 'thu'))} | ${f(wl(rs, 'raceDay'))}`);
  }
console.log('\n## H2. Qualifying: ratings alone | qualifying head');
for (const w of WINS) {
  const rs = rows.filter((r) => r.session === 'qual' && inW(w)(r));
  console.log(`${w[0].padEnd(20)} all ${f(wl(rs, 'base'))} | ${f(wl(rs, 'qualHead'))}`);
}
console.log(
  '\n## H3. Calibration of each forecast on race observations (slope through the origin of the log-odds; 1 = right) and expected calibration error',
);
for (const key of ['base', 'thu', 'raceDay']) {
  const rs = rows.filter((r) => r.session === 'race' && r[key] != null && r.year >= 2008);
  const m = logit(
    rs.map((r) => ({ ...r, z: lg(r[key]) })),
    [(r) => r.z],
    { cluster: (r) => `${r.i}` },
  );
  // ECE over deciles of the favourite's probability
  const fav = rs
    .map((r) => (r[key] >= 0.5 ? { p: r[key], hit: r.o } : { p: 1 - r[key], hit: 1 - r.o, w: r.w }))
    .map((r, k) => ({ ...r, w: rs[k].w }));
  fav.sort((a, b) => a.p - b.p);
  const B = 10;
  let ece = 0;
  let tw = 0;
  for (let b = 0; b < B; b++) {
    const g = fav.slice(Math.floor((b * fav.length) / B), Math.floor(((b + 1) * fav.length) / B));
    const w = g.reduce((s, r) => s + r.w, 0);
    if (!w) continue;
    ece += Math.abs(g.reduce((s, r) => s + r.w * r.p, 0) / w - g.reduce((s, r) => s + r.w * r.hit, 0) / w) * w;
    tw += w;
  }
  console.log(
    `${{ base: 'ratings alone', thu: 'Thursday head', raceDay: 'race-day head' }[key].padEnd(15)} slope ${f(m.b[0], 3)} (se ${f(m.se[0], 3)})  ECE ${f(ece / tw, 4)}`,
  );
}

// ---- drivers in a new car: the same duels as the strict test, but forecast ONLINE (heads see form and the move): teammate duels in the first K weekends
const idx = indexTimeline(prep.timeline, prep.ctx);
const moves = findMoves(idx).filter((m) => m.valid);
const byKey = new Map(rows.filter((r) => r.session === 'race').map((r) => [`${r.i}|${r.x}|${r.y}`, r]));
const movers = [];
for (const ev of moves)
  ev.apps.slice(0, 10).forEach((app, j) => {
    for (const ob of idx.timeline[app.i].obs.race) {
      if (!ob.same || (ob.x !== ev.driverId && ob.y !== ev.driverId)) continue;
      const r = byKey.get(`${app.i}|${ob.x}|${ob.y}`);
      if (!r) continue;
      const sign = ob.x === ev.driverId ? 1 : -1;
      const orient = (p) => (sign > 0 ? p : 1 - p);
      movers.push({
        ...r,
        j: j + 1,
        cluster: `${ev.driverId}@${ev.t0}`,
        om: sign > 0 ? r.o : 1 - r.o,
        pm: { base: orient(r.base), thu: orient(r.thu), raceDay: orient(r.raceDay) },
      });
    }
  });
const stayers = rows.filter((r) => {
  if (r.session !== 'race' || !r.same) return false;
  const tx = idx.tenure[r.i].get(r.x);
  const ty = idx.tenure[r.i].get(r.y);
  return tx >= 10 && ty >= 10;
});
console.log(
  `\n## H4. Drivers in a new car (${new Set(movers.map((r) => r.cluster)).size} moves, ${movers.length} duels; first 10 weekends), forecast online. Loss: ratings alone | Thursday | race-day, movers vs stayers' duels of the same years`,
);
for (const w of [
  ['2002-15', 2002, 2015],
  ['2002-11', 2002, 2011],
  ['2012-15', 2012, 2015],
]) {
  const mv = movers.filter(inW(w));
  const st = stayers.filter(inW(w));
  console.log(
    `${w[0].padEnd(9)} movers ${f(wl(mv, 'base'))} | ${f(wl(mv, 'thu'))} | ${f(wl(mv, 'raceDay'))}      stayers ${f(wl(st, 'base'))} | ${f(wl(st, 'thu'))} | ${f(wl(st, 'raceDay'))}`,
  );
}
console.log(
  '\n## H5. Calibration slope of each online forecast: movers | stayers, and the ratio (1 = movers are as forecastable as stayers)',
);
for (const key of ['base', 'thu', 'raceDay']) {
  const M = movers.filter((r) => r.year <= 2015).map((r) => ({ z: lg(r.pm[key]), o: r.om, w: r.w, cluster: r.cluster }));
  const S = stayers.filter((r) => r.year <= 2015).map((r) => ({ z: lg(r[key]), o: r.o, w: r.w, cluster: `${r.i}|${r.x}` }));
  const cm = logit(M, [(r) => r.z], { cluster: (r) => r.cluster });
  const cs = logit(S, [(r) => r.z], { cluster: (r) => r.cluster });
  console.log(
    `${{ base: 'ratings alone', thu: 'Thursday head', raceDay: 'race-day head' }[key].padEnd(15)} movers ${f(cm.b[0], 2)} (se ${f(cm.se[0], 2)}) | stayers ${f(cs.b[0], 2)} (se ${f(cs.se[0], 2)}) | ratio ${f(cm.b[0] / cs.b[0], 2)}`,
  );
}
console.log(
  '\n## H6. Mover-centred residual (outcome - forecast) by weekend since the move, as the forecast sees the move: ratings alone | Thursday | race-day (optimum 0)',
);
for (const [a, b] of [
  [1, 1],
  [2, 3],
  [4, 10],
]) {
  const rs = movers.filter((r) => r.year <= 2015 && r.j >= a && r.j <= b);
  const w = rs.reduce((s, r) => s + r.w, 0);
  const res = (key) => rs.reduce((s, r) => s + r.w * (r.om - r.pm[key]), 0) / w;
  console.log(`weekend ${a}-${b}`.padEnd(14) + ` ${f(res('base'), 3)} | ${f(res('thu'), 3)} | ${f(res('raceDay'), 3)}   (n ${rs.length})`);
}

// ---- machine-readable figures for the methodology page (tools/make-metrics-snapshot.mjs)
if (process.argv.includes('--json')) {
  const w0 = rows.filter((r) => r.session === 'race' && r.year >= 2008 && r.year <= 2011);
  const slopeOf = (key) =>
    logit(
      rows.filter((r) => r.session === 'race' && r[key] != null && r.year >= 2008).map((r) => ({ ...r, z: lg(r[key]) })),
      [(r) => r.z],
      { cluster: (r) => `${r.i}` },
    ).b[0];
  const ratioOf = (key) => {
    const M = movers.filter((r) => r.year <= 2015).map((r) => ({ z: lg(r.pm[key]), o: r.om, w: r.w, cluster: r.cluster }));
    const S = stayers.filter((r) => r.year <= 2015).map((r) => ({ z: lg(r[key]), o: r.o, w: r.w, cluster: `${r.i}|${r.x}` }));
    return logit(M, [(r) => r.z], { cluster: (r) => r.cluster }).b[0] / logit(S, [(r) => r.z], { cluster: (r) => r.cluster }).b[0];
  };
  writeFileSync(
    process.argv[process.argv.indexOf('--json') + 1],
    JSON.stringify(
      {
        loss2008: { base: wl(w0, 'base'), thu: wl(w0, 'thu'), raceDay: wl(w0, 'raceDay') },
        slope: { base: slopeOf('base'), thu: slopeOf('thu'), raceDay: slopeOf('raceDay') },
        moverRatio: { base: ratioOf('base'), thu: ratioOf('thu'), raceDay: ratioOf('raceDay') },
      },
      null,
      1,
    ),
  );
}
