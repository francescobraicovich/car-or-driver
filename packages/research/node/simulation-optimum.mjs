// Reference values on Simulator v2 (both sessions simulated, 4 seeds, race, through 2015): the loss an ORACLE with the true levels reaches, next to the filter's, per pair type
// and window, and the truth metrics of the filter. The oracle is the best any rating-based forecast can do in that world (it still faces weekend-level noise).
//   node packages/research/node/simulation-optimum.mjs > research/eval/simulation-optimum.txt
import {
  fitSlope,
  indexTimeline,
  observationRows,
  stateSpaceRun,
  truncateTimeline,
  truthMetrics,
  worldFromHyper,
  worldParamsV2,
  catalogue,
} from '../../eval/src/index.js';
import { writeFileSync } from 'node:fs';
import { loadData } from './common.mjs';
import { prepareReal } from '../../eval/src/pipeline.js';
import { merge } from './separation-report.mjs';
import { FINAL } from './strict-eval.mjs';
import { qualLink } from '../../core/src/state-space/qualifying-link.js';
import { bothSessions } from './simulation-both.mjs';

const f = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
const data = await loadData(new URL('../../../data', import.meta.url).pathname);
const prep = prepareReal(data, { holdout: false });
const timeline = truncateTimeline(prep.timeline, 2015);
const idx0 = indexTimeline(timeline, prep.ctx);
const base = merge({});
const lossOf = (rows, c) => {
  let s = 0;
  let w = 0;
  for (const r of rows) {
    s += r.w * (r.o ? Math.log1p(Math.exp(-c * r.z)) : Math.log1p(Math.exp(c * r.z)));
    w += r.w;
  }
  return w ? s / w : NaN;
};
const json = {};
for (const [label, over] of [
  ['default world', {}],
  ['driver-car fit x3', { sdInt: { race: 15, qual: 5.4 } }],
]) {
  const params = worldParamsV2(worldFromHyper, {}, { version: 2, ...over });
  const acc = { oracle: {}, filter: {}, old: {} };
  const truthAcc = [];
  const baseAcc = [];
  for (const seed of [1, 2, 3, 4]) {
    const world = bothSessions(timeline, idx0, params, seed);
    const idx = indexTimeline(world.timeline, prep.ctx);
    const qual = stateSpaceRun(world.timeline, 'qual', prep.ctx, base.qual);
    const runF = stateSpaceRun(
      world.timeline,
      'race',
      { ...prep.ctx, ...qualLink(qual, FINAL.beta, FINAL.gamma) },
      { ...base.race, ...FINAL.race },
    );
    const runO = stateSpaceRun(world.timeline, 'race', prep.ctx, base.race);
    const k = runF.k;
    const oracleRows = [];
    world.timeline.forEach((w, i) =>
      w.obs.race.forEach((ob) => {
        const td = world.truth.drivers[i];
        const tc = world.truth.cars[i];
        const gap = td.get(ob.x) + tc.get(ob.cx) - td.get(ob.y) - tc.get(ob.cy);
        if (Number.isFinite(gap)) oracleRows.push({ year: w.year, o: ob.o, w: ob.w, z: k * gap, same: !!ob.same });
      }),
    );
    for (const [who, rows] of [
      ['oracle', oracleRows],
      ['filter', observationRows(idx, runF).map((r) => ({ ...r, z: r.z }))],
      ['old', observationRows(idx, runO).map((r) => ({ ...r, z: r.z }))],
    ]) {
      const fit = rows.filter((r) => r.year >= 2002 && r.year <= 2007);
      const c = fitSlope(fit);
      for (const [wn, y0, y1] of [
        ['2008-11', 2008, 2011],
        ['2012-15', 2012, 2015],
      ])
        for (const [pn, pf] of [
          ['all', () => true],
          ['mates', (r) => r.same],
          ['cars', (r) => !r.same],
        ]) {
          const key = `${wn}.${pn}`;
          (acc[who][key] ??= []).push(
            lossOf(
              rows.filter((r) => r.year >= y0 && r.year <= y1 && pf(r)),
              c,
            ),
          );
        }
    }
    const events = catalogue(idx);
    const t = truthMetrics(idx, runF, world, { boot: { B: 5 }, moves: events.moves });
    truthAcc.push([t.rmseDriver.est, t.rmseCar.est, t.gapRmse.mates.est, t.gapRmse.cars.est, t.leakTruth.winterUnchanged.est]);
    const tb = truthMetrics(idx, runO, world, { boot: { B: 5 }, moves: events.moves });
    baseAcc.push([tb.rmseDriver.est, tb.rmseCar.est, tb.gapRmse.mates.est, tb.gapRmse.cars.est, tb.leakTruth.winterUnchanged.est]);
  }
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(`\n== ${label}: ratings-alone loss (multiplier fitted on 2002-2007), mean of 4 worlds`);
  console.log('window.pairs      oracle(true levels)  filter(shipped)  filter(before this phase)');
  for (const key of Object.keys(acc.oracle))
    console.log(
      `${key.padEnd(16)} ${f(avg(acc.oracle[key])).padStart(14)} ${f(avg(acc.filter[key])).padStart(16)} ${f(avg(acc.old[key])).padStart(20)}`,
    );
  const m = truthAcc[0].map((_, i) => avg(truthAcc.map((r) => r[i])));
  const mb = baseAcc[0].map((_, i) => avg(baseAcc.map((r) => r[i])));
  json[label] = {
    rmseDriver: { base: mb[0], now: m[0] },
    rmseCar: { base: mb[1], now: m[1] },
    gapMates: { base: mb[2], now: m[2] },
    gapCars: { base: mb[3], now: m[3] },
    leak: { base: mb[4], now: m[4] },
  };
  console.log(
    `truth metrics of the shipped filter: rmse driver ${f(m[0], 1)}, car ${f(m[1], 1)}, teammate gap ${f(m[2], 1)}, cross-car gap ${f(m[3], 1)}, leak vs true car swing ${f(m[4], 3)}  (optimum 0; a correct filter keeps a floor set by its posterior sd)`,
  );
}

if (process.argv.includes('--json'))
  writeFileSync(
    process.argv[process.argv.indexOf('--json') + 1],
    JSON.stringify({ default: json['default world'], fit3: json['driver-car fit x3'] }, null, 1),
  );
