// Cross-session link: the race filter reads beta times the qualifying filter's driver rating (known before the weekend) as a known
// offset of each driver's strength, so its own driver level is the race-specific residual (filter.js, ctx.offsets).
//
//   node packages/research/node/cross-session.mjs --beta 0,0.5,1 [--last 2011] [--race '{"sdD":10}'] [--json out.json]
//
// Prints, per beta: P (pooled ratings-alone loss, 2002-2011, both sessions), the frozen-rating and online loss of movers against the new teammate,
// the frozen slopes, the separation scorecard and the guards.
import { writeFileSync } from 'node:fs';
import { loadData } from './common.mjs';
import { evaluateModel, stateSpaceRun, truncateTimeline } from '../../eval/src/index.js';
import { prepareReal } from '../../eval/src/pipeline.js';
import { separationScore } from './separation.mjs';
import { merge, POINTS } from './separation-report.mjs';
import { arrivalOffsets, qualLink } from '../../core/src/state-space/qualifying-link.js';

const argv = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i < 0 ? d : argv[i + 1];
};
const f = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');

// the link itself lives in the core (state-space/qualifying-link.js); kept under its research name
export const offsetsFrom = qualLink;

/**
 * The loading of race skill on qualifying skill, estimated walk-forward from TEAMMATE differences (same car: no car in them) of two independent
 * filters, over the last `window` weekends before k: slope through the origin of the race difference on the qualifying difference, times `kappa`,
 * clamped to [0, cap]. Before `minPairs` pairs exist it is `fallback`.
 */
export function betaSeries(raceRun, qualRun, timeline, { window = 60, kappa = 1, cap = 1, minPairs = 60, fallback = 0.5 } = {}) {
  const per = timeline.map((w, k) => {
    const teams = new Map();
    for (const r of w.rows) teams.set(r.constructorId, [...(teams.get(r.constructorId) ?? []), r.driverId]);
    let sqr = 0;
    let sqq = 0;
    let n = 0;
    for (const ds of teams.values()) {
      if (ds.length !== 2) continue;
      const g = (run, d) => run.post[k].drivers.get(d);
      const [rx, ry, qx, qy] = [g(raceRun, ds[0]), g(raceRun, ds[1]), g(qualRun, ds[0]), g(qualRun, ds[1])];
      if (!(rx?.seen && ry?.seen && qx?.seen && qy?.seen)) continue;
      const q = qx.m - qy.m;
      sqr += q * (rx.m - ry.m);
      sqq += q * q;
      n++;
    }
    return { sqr, sqq, n };
  });
  return timeline.map((_, k) => {
    let sqr = 0;
    let sqq = 0;
    let n = 0;
    for (let j = Math.max(0, k - window); j < k; j++) {
      sqr += per[j].sqr;
      sqq += per[j].sqq;
      n += per[j].n;
    }
    return n < minPairs || sqq <= 0 ? fallback : Math.min(cap, Math.max(0, (kappa * sqr) / sqq));
  });
}

export function scorePoint(prep, timeline, qualSource, raceSettings, beta, boot = 50, gamma = 0, qualScored = qualSource, adapt = null) {
  const ad = arrivalOffsets(timeline, prep.ctx.canon, adapt);
  const ctx = { ...(beta || gamma ? { ...prep.ctx, ...offsetsFrom(qualSource, beta, gamma) } : prep.ctx), ...(ad ? { adapt: ad } : {}) };
  const race = stateSpaceRun(timeline, 'race', ctx, raceSettings);
  const runs = { race, qual: qualScored };
  const res = evaluateModel(timeline, prep.identity, runs, { boot: { B: boot } });
  return { res, runs, sep: separationScore(res, timeline, prep.identity, runs) };
}

export function summarise(res) {
  const H = (k) => res.headline[k]?.est;
  const loss = {};
  const weight = {};
  for (const r of res.predictive.table) {
    for (const s of ['race', 'qual']) loss[`${r.window}.${s}.${r.pair}`] = r[s].loss;
    loss[`${r.window}.combined.${r.pair}`] = r.combined;
    if (r.pair === 'all') for (const s of ['race', 'qual']) weight[`${r.window}.${s}`] = r[s].weight;
  }
  const wins = [...new Set(res.predictive.table.map((r) => r.window))];
  return { loss, weight, wins, H };
}

if (process.argv[1]?.endsWith('cross-session.mjs')) {
  const last = +opt('last', 2011);
  const betas = String(opt('beta', '0,0.5,1')).split(',');
  const raceSet = opt('race') ? JSON.parse(opt('race')) : {};
  const data = await loadData(new URL('../../../data', import.meta.url).pathname);
  const prep = prepareReal(data, { holdout: argv.includes('--holdout') }); // --holdout reads 2016+ (use with --last 9999; pre-registered: once)
  const timeline = truncateTimeline(prep.timeline, last);
  const base = opt('point') ? merge(POINTS[opt('point')]) : merge({});
  if (opt('qual')) Object.assign(base.qual, JSON.parse(opt('qual')));
  // the offset SOURCE can be a variant of the qualifying filter (opt --qsrc); the scored qualifying run is always the shipped one
  const qualScored = stateSpaceRun(timeline, 'qual', prep.ctx, base.qual);
  const qualRun = opt('qsrc') ? stateSpaceRun(timeline, 'qual', prep.ctx, { ...base.qual, ...JSON.parse(opt('qsrc')) }) : qualScored;
  const out = {};
  const raceInd = betas.some((b) => b.startsWith('auto')) ? stateSpaceRun(timeline, 'race', prep.ctx, base.race) : null;
  for (const bs of betas) {
    let beta = +bs;
    if (bs.startsWith('auto')) {
      const [, w = 60, kp = 1] = bs.split(':');
      beta = betaSeries(raceInd, qualRun, timeline, { window: +w, kappa: +kp });
      console.log(
        `  beta series ${bs}: ` +
          [2004, 2008, 2012, 2014].map((y) => `${y}: ${beta[timeline.findIndex((t) => t.year === y)]?.toFixed(2)}`).join('  '),
      );
    }
    const { res, sep } = scorePoint(prep, timeline, qualRun, { ...base.race, ...raceSet }, beta, 50, +opt('gamma', 0), qualScored);
    const { loss, wins, H } = summarise(res);
    console.log(
      `\n== beta ${bs} gamma ${opt('gamma', 0)} ${JSON.stringify(raceSet)}  D2 ${f(sep.D2, 3)} (race ${f(sep.race.D, 3)})  T1..T4 race ${[sep.race.T1, sep.race.T2, sep.race.T3, sep.race.T4].map((v) => f(v, 3)).join(' ')}`,
    );
    for (const w of wins)
      console.log(
        `  ${w}: race all ${f(loss[`${w}.race.all`])} mates ${f(loss[`${w}.race.mates`])} cars ${f(loss[`${w}.race.cars`])} | comb all ${f(loss[`${w}.combined.all`])} mates ${f(loss[`${w}.combined.mates`])}`,
      );
    for (const K of [5, 10])
      console.log(
        `  movers race k${K}: frozenLoss ${f(H(`movers.race.frozenLoss.k${K}`))} onlineLoss ${f(H(`movers.race.onlineLoss.k${K}`))} frozenSlope mov ${f(H(`movers.race.frozenSlope.k${K}`), 3)} stay ${f(H(`movers.race.frozenSlopeStayers.k${K}`), 3)}`,
      );
    console.log(
      `  qual: ${wins.map((w) => `${w} all ${f(loss[`${w}.qual.all`])} mates ${f(loss[`${w}.qual.mates`])}`).join(' | ')} | frozenLoss k5 ${f(H('movers.qual.frozenLoss.k5'))} online ${f(H('movers.qual.onlineLoss.k5'))} slope mov ${f(H('movers.qual.frozenSlope.k5'), 2)} stay ${f(H('movers.qual.frozenSlopeStayers.k5'), 2)} D qual ${f(sep.qual.D, 3)}`,
    );
    console.log(
      `  guards race: effDriver ${f(H('health.race.efficiency.driver'), 3)} effCar ${f(H('health.race.efficiency.car'), 3)} calSlope ${f(H('predictive.calSlope.race.all'), 3)}`,
    );
    out[bs] = {
      sep: { D2: sep.D2, race: sep.race, qual: sep.qual },
      loss,
      headline: Object.fromEntries(Object.entries(res.headline).map(([k, v]) => [k, v.est])),
    };
  }
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify(out));
}
