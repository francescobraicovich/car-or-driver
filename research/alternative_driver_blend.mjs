// Diagnostic: does the independent ranking learner contain portable driver
// information that improves the existing car model when used for every driver?
import { fitSlope, observationRows, predictiveMetrics, stateSpaceRun } from '../packages/eval/src/index.js';
import { qualLink } from '../packages/core/src/state-space/qualifying-link.js';
import { strictItems, strictScores } from '../packages/research/node/mover-strict.mjs';
import { FINAL, load } from '../packages/research/node/strict-eval.mjs';
import { componentExposure, discriminativeRanking } from './alternative_rating_models.mjs';

const env = await load(2025, true);
const { timeline, prep, base, idx, moves } = env;
const exposure = componentExposure(timeline, prep.data.raw.races);
const challengerOptions = process.argv[2] ? JSON.parse(process.argv[2]) : { includeComponent: false };
const qualifying = stateSpaceRun(timeline, 'qual', prep.ctx, base.qual);
const race = stateSpaceRun(timeline, 'race', { ...prep.ctx, ...qualLink(qualifying.raw, FINAL.beta, FINAL.gamma) }, { ...base.race, ...FINAL.race });
const challenger = discriminativeRanking(timeline, 'race', prep.ctx.carOf, exposure, challengerOptions);

for (const share of [0, 0.25, 0.5, 0.75, 1]) {
  const difference = (i, id) => share * ((challenger.pre[i].rated.get(id) ?? 0) - (race.pre[i].rated.get(id) ?? 0));
  const candidate = {
    ...race,
    post: race.post.map((weekend, i) => ({
      ...weekend,
      drivers: new Map([...weekend.drivers].map(([id, rating]) => [id, {
        ...rating,
        m: rating.m + share * ((challenger.post[i].drivers.get(id)?.m ?? rating.m) - rating.m),
      }])),
    })),
    pre: race.pre.map((weekend, i) => ({
      ...weekend,
      rated: new Map([...weekend.rated].map(([id, value]) => [id, value + difference(i, id)])),
      drivers: new Map([...weekend.drivers].map(([id, value]) => [id, value + difference(i, id)])),
    })),
    z: race.z.map((weekend, i) => ({
      ...weekend,
      plain: Float64Array.from(weekend.plain, (value, j) => {
        const ob = timeline[i].obs.race[j];
        return value + race.k * (difference(i, ob.x) - difference(i, ob.y));
      }),
      adj: Float64Array.from(weekend.adj, (value, j) => {
        const ob = timeline[i].obs.race[j];
        const attenuation = Math.sqrt(1 + (Math.PI / 8) * race.k * race.k * weekend.vari[j]);
        return value + race.k * (difference(i, ob.x) - difference(i, ob.y)) / attenuation;
      }),
    })),
  };
  const score = predictiveMetrics(idx, { race: candidate, qual: qualifying });
  const rows = observationRows(idx, candidate).filter((row) => row.year >= 2002 && row.year <= 2007 && !row.same);
  const calibration = fitSlope(rows);
  const movers = strictScores(idx, candidate, calibration, {
    moves,
    windows: [['2002-11', 2002, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]],
  });
  const items = strictItems(idx, candidate, moves, 5).filter((item) => item.kind === 'tm');
  const moverAccuracy = Object.fromEntries([['2002-11', 2002, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]].map(([window, from, to]) => {
    const selected = items.filter((item) => item.year >= from && item.year <= to);
    const weight = selected.reduce((sum, item) => sum + item.w, 0);
    return [window, selected.reduce((sum, item) => sum + item.w * (Math.abs(item.z) < 1e-10 ? 0.5 : Number((item.z > 0) === !!item.o)), 0) / weight];
  }));
  let displacement = 0;
  let drivers = 0;
  let reversals = 0;
  let pairs = 0;
  for (const [i, weekend] of timeline.entries()) {
    if (weekend.year < 2024) continue;
    const ids = [...race.post[i].drivers.keys()];
    const rank = (run) => new Map(ids.slice().sort((a, b) => run.post[i].drivers.get(b).m - run.post[i].drivers.get(a).m).map((id, place) => [id, place]));
    const oldRank = rank(race);
    const newRank = rank(candidate);
    for (const id of ids) {
      displacement += Math.abs(oldRank.get(id) - newRank.get(id));
      drivers++;
    }
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      reversals += Number((oldRank.get(ids[a]) - oldRank.get(ids[b])) * (newRank.get(ids[a]) - newRank.get(ids[b])) < 0);
      pairs++;
    }
  }
  const last = timeline.length - 1;
  const latestIds = [...race.post[last].drivers.keys()];
  const order = (run) => new Map(latestIds.slice().sort((a, b) => run.post[last].drivers.get(b).m - run.post[last].drivers.get(a).m).map((id, place) => [id, place + 1]));
  const oldOrder = order(race);
  const newOrder = order(candidate);
  const driverName = new Map(prep.data.raw.drivers.map((driver) => [String(driver.driverId), `${driver.forename} ${driver.surname}`]));
  const latestChanges = latestIds.map((id) => ({
    driver: driverName.get(id) ?? id,
    before: oldOrder.get(id),
    after: newOrder.get(id),
  })).filter((item) => item.before !== item.after).sort((a, b) => Math.abs(b.before - b.after) - Math.abs(a.before - a.after));
  console.log(JSON.stringify({
    challengerOptions,
    share,
    allPairLoss: Object.fromEntries(['w2', 'w3', 'holdout'].map((window) => [window, score.table.find((row) => row.window === window && row.pair === 'all').combined])),
    moverLoss: Object.fromEntries(['2002-11', '2012-15', '2016-25'].map((window) => [window, movers[`${window}.k5`].tmLoss])),
    moverAccuracy,
    recentRankMovement: { meanAbsolutePlaces: displacement / drivers, pairReversalRate: reversals / pairs },
    ...(share === 0.25 ? { latestChanges } : {}),
  }));
}
