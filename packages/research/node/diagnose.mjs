// Why is a mover's prior rating a worse forecast than a stayer's? Real-data diagnosis (docs/diagnosis.md).
//   node packages/research/node/diagnose.mjs [--K 10] > research/eval/diagnosis-real.txt
// Hypotheses are formed on moves of 2002-2011 and verified on 2012-2015 and 2016+ (windows printed side by side).
import { loadData } from './common.mjs';
import { indexTimeline, stateSpaceRun } from '../../eval/src/index.js';
import { prepareReal } from '../../eval/src/pipeline.js';
import { merge } from './separation-report.mjs';
import { FINAL } from './strict-eval.mjs';
import { BASELINE } from './separation-report.mjs';
import { scorePoint } from './cross-session.mjs';
import { duelRecords, logit } from './diagnostics-library.mjs';

const argv = process.argv.slice(2);
const K = +(argv[argv.indexOf('--K') + 1] || 10);
const MODEL = argv.includes('--model') ? argv[argv.indexOf('--model') + 1] : 'final';
const CFG = MODEL === 'base' ? { beta: 0, gamma: 0, race: BASELINE.race } : FINAL;
const data = await loadData(new URL('../../../data', import.meta.url).pathname);
const prep = prepareReal(data, { holdout: true });
const timeline = prep.timeline;
const env = { idx: indexTimeline(timeline, prep.ctx), timeline, prep };
const base = merge({});
const qualRun = stateSpaceRun(timeline, 'qual', prep.ctx, base.qual);
const { runs } = scorePoint(prep, timeline, qualRun, { ...base.race, ...CFG.race }, CFG.beta, 5, CFG.gamma);
const raw = prep.data?.raw ?? prep.raw;
const dobs = new Map(raw.drivers.map((d) => [String(d.driverId), new Date(d.dob).getTime()]));
const dates = new Map(raw.races.map((r) => [String(r.raceId), new Date(r.date).getTime()]));
const dobOf = (d) => dobs.get(String(d));
const dateOf = (i) => dates.get(String(timeline[i].raceId ?? timeline[i].info?.raceId)) ?? new Date(`${timeline[i].year}-07-01`).getTime();
const { movers, stayers } = duelRecords(env, runs.race, qualRun, K, dobOf, dateOf);

const f = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
const WINS = [
  ['2002-11', 2002, 2011],
  ['2012-15', 2012, 2015],
  ['2016+', 2016, 9999],
];
const inW = (w) => (r) => r.year >= w[1] && r.year <= w[2];
const cal = (rows) => logit(rows, [(r) => r.z], { cluster: (r) => r.cluster });
const line = (name, ...cells) => console.log(`${name.padEnd(34)}${cells.join('  ')}`);
console.log(
  `# Real-data diagnosis, race, first ${K} weekends after a move, strict prior ratings (model: ${MODEL}). Windows: ${WINS.map((w) => w[0]).join(' | ')}`,
);
console.log(`movers: ${movers.length} duels, ${new Set(movers.map((r) => r.cluster)).size} moves; stayers: ${stayers.length} duels\n`);

console.log('## D0. Calibration slope of the frozen rating gap, cluster-robust (clusters: a move; a pair-season)');
for (const w of WINS) {
  const m = cal(movers.filter(inW(w)));
  const s = cal(stayers.filter(inW(w)));
  // movers vs stayers: pooled with interaction, clusters
  const pool = [...movers.filter(inW(w)), ...stayers.filter(inW(w))];
  const it = logit(pool, [(r) => r.z, (r) => (r.kind === 'mover' ? r.z : 0)], { cluster: (r) => r.cluster });
  line(
    w[0],
    `movers ${f(m.b[0], 2)} (se ${f(m.se[0], 2)}, ${m.clusters} moves)`,
    `stayers ${f(s.b[0], 2)} (se ${f(s.se[0], 2)})`,
    `difference ${f(it.b[1], 2)} (se ${f(it.se[1], 2)}, z ${f(it.b[1] / it.se[1], 1)})`,
  );
}

console.log(
  '\n## D1. Calibration by size of the prior gap (observed win rate of the rated-better driver vs the stayers-calibrated forecast); gap in rating points',
);
const cSt = Object.fromEntries(WINS.map((w) => [w[0], cal(stayers.filter(inW(w))).b[0]]));
for (const w of WINS) {
  for (const [lab, rows] of [
    ['movers', movers.filter(inW(w))],
    ['stayers', stayers.filter(inW(w))],
  ]) {
    const bins = [
      [0, 10],
      [10, 25],
      [25, 50],
      [50, 999],
    ];
    const cells = bins.map(([lo, hi]) => {
      const rs = rows.filter((r) => r.absGap >= lo && r.absGap < hi);
      if (rs.length < 15) return `${lo}-${hi}: n/a`;
      let ow = 0,
        pw = 0,
        ww = 0;
      for (const r of rs) {
        const fav = r.z >= 0 ? 1 : 0;
        const p = 1 / (1 + Math.exp(-cSt[w[0]] * Math.abs(r.z)));
        ow += r.w * (r.o === fav ? 1 : 0);
        pw += r.w * p;
        ww += r.w;
      }
      return `${lo}-${hi}: obs ${f(ow / ww, 2)} / fcst ${f(pw / ww, 2)} (n ${rs.length})`;
    });
    line(`${w[0]} ${lab}`, cells.join(' | '));
  }
}

console.log(
  '\n## D2. Adaptation: mean (outcome - forecast) by weekend since the move (forecast = stayers-calibrated frozen rating); and slope by block',
);
for (const w of WINS) {
  const rows = movers.filter(inW(w));
  const cells = [];
  for (const [a, b] of [
    [1, 1],
    [2, 3],
    [4, 6],
    [7, 10],
  ]) {
    const rs = rows.filter((r) => r.j >= a && r.j <= b);
    if (rs.length < 20) {
      cells.push(`j${a}-${b}: n/a`);
      continue;
    }
    let res = 0,
      ww = 0;
    for (const r of rs) {
      res += r.w * (r.o - 1 / (1 + Math.exp(-cSt[w[0]] * r.z)));
      ww += r.w;
    }
    const sl = cal(rs);
    cells.push(`j${a}-${b}: resid ${f(res / ww, 3)} slope ${f(sl.b[0], 2)}±${f(sl.se[0], 2)}`);
  }
  line(w[0], cells.join(' | '));
}

console.log(
  '\n## D3. Does anything known before the move predict the forecast error? logistic o ~ c*z + a*X, movers only, cluster-robust (a with se; z-score)',
);
const features = {
  'qualifying gap (same scale)': (r) => r.zq,
  'old minus new car (k*pts)': (r) => r.dCar,
  'momentum: rating change last 10 races (pts)': (r) => r.momentum * 0.03,
  'mover age (years, centred 28)': (r) => (r.age - 28) * 0.1,
  'mover experience (log prior races)': (r) => Math.log(r.nPrior),
  'mate is new to the team (tenure<10)': (r) => (r.mateTenure < 10 ? 1 : 0),
  'winter move': (r) => r.winter,
  '|prior gap| (pts/10)': (r) => Math.sign(r.z) * r.absGap * 0.1,
};
for (const [name, fx] of Object.entries(features)) {
  const cells = WINS.map((w) => {
    const rs = movers.filter(inW(w)).filter((r) => Number.isFinite(fx(r)));
    if (rs.length < 60) return `${w[0]}: n/a`;
    const m = logit(rs, [(r) => r.z, fx], { cluster: (r) => r.cluster, init: [0.8, 0] });
    return `${w[0]}: ${f(m.b[1], 2)} (se ${f(m.se[1], 2)}, z ${f(m.b[1] / m.se[1], 1)})`;
  });
  line(name, cells.join(' | '));
}

console.log('\n## D4. The same two-predictor regression for STAYERS (race gap z and qualifying gap zq): weights of each');
for (const w of WINS) {
  const sm = logit(stayers.filter(inW(w)), [(r) => r.z, (r) => r.zq], { cluster: (r) => r.cluster, init: [0.8, 0.2] });
  const mm = logit(
    movers.filter(inW(w)).filter((r) => Number.isFinite(r.zq)),
    [(r) => r.z, (r) => r.zq],
    { cluster: (r) => r.cluster, init: [0.8, 0.2] },
  );
  line(
    w[0],
    `stayers: race ${f(sm.b[0], 2)}±${f(sm.se[0], 2)}  qual ${f(sm.b[1], 2)}±${f(sm.se[1], 2)}`,
    `movers: race ${f(mm.b[0], 2)}±${f(mm.se[0], 2)}  qual ${f(mm.b[1], 2)}±${f(mm.se[1], 2)}`,
  );
}

console.log('\n## D5. Influence: leave-one-move-out slope; share of the movers loss from the five worst moves');
for (const w of WINS) {
  const rows = movers.filter(inW(w));
  const groups = [...new Set(rows.map((r) => r.cluster))];
  const slopes = groups.map((g) => cal(rows.filter((r) => r.cluster !== g)).b[0]);
  const all = cal(rows).b[0];
  const contrib = groups
    .map((g) => {
      const rs = rows.filter((r) => r.cluster === g);
      return {
        g,
        l: rs.reduce((s, r) => s + r.w * (r.o ? Math.log1p(Math.exp(-cSt[w[0]] * r.z)) : Math.log1p(Math.exp(cSt[w[0]] * r.z))), 0),
      };
    })
    .sort((a, b) => b.l - a.l);
  const tot = contrib.reduce((s, c) => s + c.l, 0);
  line(
    w[0],
    `slope ${f(all, 2)}, leave-one-out range [${f(Math.min(...slopes), 2)}, ${f(Math.max(...slopes), 2)}] over ${groups.length} moves`,
    `five worst moves = ${f((100 * contrib.slice(0, 5).reduce((s, c) => s + c.l, 0)) / tot, 0)}% of loss (a uniform share would be ${f(500 / groups.length, 0)}%)`,
  );
}

console.log(
  '\n## D6. Could a mover-sized sample of stayers show a slope this low? (draw as many stayer pair-seasons as there are moves, 400 times)',
);
let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
for (const w of WINS) {
  const mrows = movers.filter(inW(w));
  const nm = new Set(mrows.map((r) => r.cluster)).size;
  const mslope = cal(mrows).b[0];
  const groups = new Map();
  for (const r of stayers.filter(inW(w))) (groups.get(r.cluster) ?? groups.set(r.cluster, []).get(r.cluster)).push(r);
  const keys = [...groups.keys()];
  let below = 0;
  const draws = [];
  for (let b = 0; b < 400; b++) {
    const pool = [];
    for (let i = 0; i < nm; i++) pool.push(...groups.get(keys[Math.floor(rnd() * keys.length)]));
    const s = logit(pool, [(r) => r.z], { cluster: (r) => r.cluster }).b[0];
    draws.push(s);
    if (s <= mslope) below++;
  }
  draws.sort((a, b) => a - b);
  line(
    w[0],
    `mover slope ${f(mslope, 2)}; stayer samples of ${nm} units: median ${f(draws[200], 2)}, 5%-95% [${f(draws[20], 2)}, ${f(draws[380], 2)}]; share at or below the mover slope ${f(below / 400, 3)}`,
  );
}

console.log('\n## D7. By observation source (calibration slope; movers | stayers)');
for (const w of WINS) {
  const cells = ['finish', 'paceW', 'partial'].map((src) => {
    const m = movers.filter(inW(w)).filter((r) => r.src === src);
    const s = stayers.filter(inW(w)).filter((r) => r.src === src);
    return `${src}: ${m.length > 40 ? f(cal(m).b[0], 2) : 'n/a'} (n ${m.length}) | ${s.length > 40 ? f(cal(s).b[0], 2) : 'n/a'}`;
  });
  line(w[0], cells.join('   '));
}

console.log(
  '\n## D8. Which part of the race gap is portable? z = beta*zq + zD (qualifying part + race-specific residual). logistic o ~ a*zD + b*zq, cluster-robust',
);
for (const w of WINS) {
  const cells = [];
  for (const [lab, rows] of [
    ['movers', movers.filter(inW(w))],
    ['stayers', stayers.filter(inW(w))],
  ]) {
    const m = logit(
      rows.filter((r) => Number.isFinite(r.zq)),
      [(r) => r.z - FINAL.beta * r.zq, (r) => r.zq],
      { cluster: (r) => r.cluster, init: [0.8, 0.5] },
    );
    cells.push(`${lab}: residual weight a ${f(m.b[0], 2)}±${f(m.se[0], 2)}, qualifying weight b ${f(m.b[1], 2)}±${f(m.se[1], 2)}`);
  }
  line(w[0], cells.join(' | '));
}

console.log('\n## D9. Pooled: movers vs stayers slope; and the mover-centred residual (outcome - forecast) by weekend since the move.');
console.log(
  '(Residuals are oriented to the MOVER, so they are meaningful; stayers have no such orientation: the exam lists the winner as x, losses and slopes are unaffected by that.)',
);
{
  const pool = [...movers, ...stayers];
  const it = logit(pool, [(r) => r.z, (r) => (r.kind === 'mover' ? r.z : 0)], { cluster: (r) => r.cluster });
  line('slope difference (all years)', `${f(it.b[1], 2)} (se ${f(it.se[1], 2)}, z ${f(it.b[1] / it.se[1], 1)}), ${it.clusters} clusters`);
  const cs = cal(stayers).b[0];
  const resid = (rows) => {
    let s = 0,
      ww = 0;
    const cl = new Map();
    for (const r of rows) {
      const e = r.w * (r.o - 1 / (1 + Math.exp(-cs * r.z)));
      s += e;
      ww += r.w;
      cl.set(r.cluster, (cl.get(r.cluster) ?? 0) + e);
    }
    const mean = s / ww;
    let v = 0;
    for (const e of cl.values()) v += e * e;
    return [mean, Math.sqrt(v) / ww, cl.size];
  };
  for (const [lab, sel] of [
    ['all moves', () => true],
    ['winter moves (season opener is the first weekend)', (r) => r.winter],
    ['in-season moves', (r) => !r.winter],
  ]) {
    const cells = [
      [1, 1],
      [2, 3],
      [4, 10],
    ].map(([a, b]) => {
      const [m, se, n] = resid(movers.filter((r) => r.j >= a && r.j <= b && sel(r)));
      return `weekend ${a}-${b}: ${f(m, 3)} (se ${f(se, 3)}, ${n} moves)`;
    });
    line(lab, cells.join(' | '));
  }
  for (const w of WINS) {
    const cells = [
      [1, 1],
      [2, 3],
      [4, 10],
    ].map(([a, b]) => {
      const [m, se] = resid(movers.filter((r) => r.j >= a && r.j <= b && r.year >= w[1] && r.year <= w[2]));
      return `${a}-${b}: ${f(m, 3)} (${f(se, 3)})`;
    });
    line(`  ${w[0]}`, cells.join(' | '));
  }
}
{
  const cs = cal(stayers).b[0];
  const resid = (rows, online) => {
    let s = 0,
      ww = 0;
    for (const r of rows) {
      s += r.w * (r.o - 1 / (1 + Math.exp(-(online ? r.zOn : cs * r.z))));
      ww += r.w;
    }
    return s / ww;
  };
  console.log(
    "\n## D10. The filter's own ONLINE forecast of the same duels (it sees the move): mover-centred residual by weekend since the move",
  );
  for (const [a, b] of [
    [1, 1],
    [2, 3],
    [4, 10],
  ]) {
    const rows = movers.filter((r) => r.j >= a && r.j <= b && Number.isFinite(r.zOn));
    line(`weekend ${a}-${b}`, `frozen prior ${f(resid(rows, false), 3)} | online forecast ${f(resid(rows, true), 3)}`);
  }
}

console.log(
  '\n## D11. Is the shortfall at large prior gaps? slope for |gap| < 25 pts and >= 25 pts, movers vs stayers (all windows pooled and 2012+), cluster-robust',
);
for (const [lab, y0] of [
  ['2002+', 2002],
  ['2012+', 2012],
]) {
  const cells = [];
  for (const [who, rows] of [
    ['movers', movers],
    ['stayers', stayers],
  ]) {
    const rs = rows.filter((r) => r.year >= y0);
    const m = logit(rs, [(r) => (r.absGap < 25 ? r.z : 0), (r) => (r.absGap >= 25 ? r.z : 0)], {
      cluster: (r) => r.cluster,
      init: [0.8, 0.8],
    });
    cells.push(
      `${who}: small gaps ${f(m.b[0], 2)}±${f(m.se[0], 2)}, large gaps ${f(m.b[1], 2)}±${f(m.se[1], 2)} (n ${rs.filter((r) => r.absGap >= 25).length} large)`,
    );
  }
  line(lab, cells.join(' | '));
}

console.log(
  '\n## D12. Reliability proxies known before the move: connectivity of the mover (number of different teammates so far) and length of his last stint',
);
{
  const apps = env.idx.appear;
  const teammatesBefore = (r) => {
    const mates = new Set();
    for (const a of apps.get(r.driverId)) {
      if (a.i > r.ell) break;
      for (const row of timeline[a.i].rows)
        if (String(row.constructorId) === String(a.cid ?? a.team) && String(row.driverId) !== String(r.driverId)) mates.add(row.driverId);
    }
    return mates.size;
  };
  const rows = movers.map((r) => ({ ...r, nm: teammatesBefore(r) }));
  const med = [...rows.map((r) => r.nm)].sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  for (const [lab, sel] of [
    [`few teammates (<= ${med})`, (r) => r.nm <= med],
    [`many teammates (> ${med})`, (r) => r.nm > med],
  ]) {
    const rs = rows.filter(sel);
    const m = cal(rs);
    line(lab, `slope ${f(m.b[0], 2)}±${f(m.se[0], 2)} (${m.clusters} moves)`);
  }
  for (const [lab, sel] of [
    ['short last stint (< median tenure)', (r) => r.moverTenureOld < 40],
    ['long last stint', (r) => r.moverTenureOld >= 40],
  ]) {
    const rs = movers.filter(sel);
    const m = cal(rs);
    line(lab, `slope ${f(m.b[0], 2)}±${f(m.se[0], 2)} (${m.clusters} moves)`);
  }
}

console.log(
  '\n## D13. Does the filter know which ratings are unreliable? Slope by tercile of the gap sd (sqrt(sd_x^2 + sd_y^2), reported scale), terciles within each group',
);
for (const [who, rows] of [
  ['stayers', stayers],
  ['movers', movers],
]) {
  const rs = rows.filter((r) => Number.isFinite(r.sdG));
  const sorted = [...rs].sort((a, b) => a.sdG - b.sdG);
  const cuts = [sorted[Math.floor(sorted.length / 3)].sdG, sorted[Math.floor((2 * sorted.length) / 3)].sdG];
  const cells = [0, 1, 2].map((t) => {
    const g = rs.filter((r) => (t === 0 ? r.sdG < cuts[0] : t === 1 ? r.sdG >= cuts[0] && r.sdG < cuts[1] : r.sdG >= cuts[1]));
    const m = cal(g);
    return `${['low', 'mid', 'high'][t]} sd (mean ${f(g.reduce((s, r) => s + r.sdG, 0) / g.length, 1)} pts): slope ${f(m.b[0], 2)}±${f(m.se[0], 2)}`;
  });
  line(who, cells.join(' | '));
}
{
  const mm = movers.filter((r) => Number.isFinite(r.sdG));
  const ss = stayers.filter((r) => Number.isFinite(r.sdG));
  const avg = (rows) => rows.reduce((s, r) => s + r.sdG, 0) / rows.length;
  line('mean gap sd', `movers ${f(avg(mm), 1)} pts | stayers ${f(avg(ss), 1)} pts`);
}
