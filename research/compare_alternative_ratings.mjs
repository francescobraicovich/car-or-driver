// Run independent driver/car rating architectures on the existing walk-forward exam.
// Usage: node research/compare_alternative_ratings.mjs network|pace|ranking|baseline
import { fitSlope, observationRows, predictiveMetrics, stateSpaceRun } from '../packages/eval/src/index.js';
import { qualLink } from '../packages/core/src/state-space/qualifying-link.js';
import { strictItems, strictScores } from '../packages/research/node/mover-strict.mjs';
import { FINAL, load } from '../packages/research/node/strict-eval.mjs';
import { componentExposure, continuousPace, discriminativeRanking, teammateNetwork } from './alternative_rating_models.mjs';

const name = process.argv[2] ?? 'network';
const options = process.argv[3] ? JSON.parse(process.argv[3]) : {};
if (!['network', 'pace', 'ranking', 'baseline'].includes(name)) throw Error(`Unknown architecture: ${name}`);
const env = await load(2025, true);
const { timeline, prep, base, idx, moves } = env;
const exposure = componentExposure(timeline, prep.data.raw.races);
const carOf = prep.ctx.carOf;
const start = performance.now();
let qual;
let race;
if (name === 'baseline') {
  qual = stateSpaceRun(timeline, 'qual', prep.ctx, base.qual);
  race = stateSpaceRun(timeline, 'race', { ...prep.ctx, ...qualLink(qual.raw, FINAL.beta, FINAL.gamma) }, { ...base.race, ...FINAL.race });
} else {
  const fit = {
    network: (session) => teammateNetwork(timeline, session, carOf, exposure, options),
    pace: (session) => continuousPace(timeline, session, prep.data, carOf, exposure, options),
    ranking: (session) => discriminativeRanking(timeline, session, carOf, exposure, options),
  }[name];
  qual = fit('qual');
  race = fit('race');
}
const predictive = predictiveMetrics(idx, { race, qual });
const rows = observationRows(idx, race).filter((row) => row.year >= 2002 && row.year <= 2007 && !row.same);
const slope = fitSlope(rows);
const strict = strictScores(idx, race, slope, {
  moves,
  windows: [['2002-11', 2002, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]],
});
const frozenTeammateDuels = strictItems(idx, race, moves, 5).filter((item) => item.kind === 'tm');
const moverAccuracy = Object.fromEntries([['2002-11', 2002, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]].map(([window, from, to]) => {
  const selected = frozenTeammateDuels.filter((item) => item.year >= from && item.year <= to);
  const weight = selected.reduce((sum, item) => sum + item.w, 0);
  return [window, selected.reduce((sum, item) => sum + item.w * (Math.abs(item.z) < 1e-10 ? 0.5 : Number((item.z > 0) === !!item.o)), 0) / weight];
}));
const losses = {};
for (const row of predictive.table) {
  losses[`${row.window}.${row.pair}`] = {
    combined: row.combined,
    race: row.race.loss,
    qual: row.qual.loss,
  };
}
const componentPairs = {};
for (const year of [2024, 2025]) {
  componentPairs[year] = {};
  for (const session of ['race', 'qual']) {
    const run = session === 'race' ? race : qual;
    let total = 0;
    let weight = 0;
    let pairs = 0;
    for (const [i, weekend] of timeline.entries()) {
      if (weekend.year !== year) continue;
      const part = exposure[i][session];
      for (const [j, ob] of weekend.obs[session].entries()) {
        if (part.has(ob.x) === part.has(ob.y)) continue;
        const value = predictive.slopes[session] * run.z[i].adj[j];
        total += ob.w * Math.log1p(Math.exp(ob.o ? -value : value));
        weight += ob.w;
        pairs++;
      }
    }
    componentPairs[year][session] = { loss: total / weight, pairs };
  }
}
const current = race.post.at(-1);
const driverNames = new Map(prep.data.raw.drivers.map((driver) => [String(driver.driverId), `${driver.forename} ${driver.surname}`]));
const carNames = new Map(prep.data.raw.constructors.map((constructor) => [String(constructor.constructorId), constructor.name]));
const ranked = (map, names) => [...map].sort((a, b) => b[1].m - a[1].m).map(([id, rating], position) => ({
  rank: position + 1,
  id,
  name: names.get(id) ?? id,
  rating: +rating.m.toFixed(1),
}));
console.log(JSON.stringify({
  architecture: name,
  options,
  weekends: timeline.length,
  elapsedSeconds: +(0.001 * (performance.now() - start)).toFixed(1),
  calibration: predictive.slopes,
  componentEffect: { race: race.componentEffect ?? null, qual: qual.componentEffect ?? null },
  losses,
  componentPairs,
  movers: Object.fromEntries(['2002-11', '2012-15', '2016-25'].map((window) => [window, {
    firstFiveTeammateLoss: strict[`${window}.k5`].tmLoss,
    firstTenTeammateLoss: strict[`${window}.k10`].tmLoss,
    firstFiveFieldLoss: strict[`${window}.k5`].fdLoss,
    firstFiveTeammateDuels: strict[`${window}.k5`].nTm,
  }])),
  moverAccuracy,
  latest: { drivers: ranked(current.drivers, driverNames), cars: ranked(current.cars, carNames) },
}, null, 2));
