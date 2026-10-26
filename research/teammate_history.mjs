// An explicit transitive teammate-only rating, using observations strictly
// before each weekend. Test whether blending it into the shipped driver rating
// improves the common exam and strict new-team forecasts.
import { stateSpaceRun, evaluateModel, observationRows, fitSlope } from '../packages/eval/src/index.js';
import { qualLink } from '../packages/core/src/state-space/qualifying-link.js';
import { strictScores } from '../packages/research/node/mover-strict.mjs';
import { summarise } from '../packages/research/node/cross-session.mjs';
import { FINAL, load } from '../packages/research/node/strict-eval.mjs';

const env = await load(2025, true);
const { timeline, prep, base, idx, moves } = env;
const qual = stateSpaceRun(timeline, 'qual', prep.ctx, base.qual);
const main = stateSpaceRun(timeline, 'race', { ...prep.ctx, ...qualLink(qual.raw, FINAL.beta, FINAL.gamma) }, { ...base.race, ...FINAL.race });
const teammateTimeline = timeline.map((weekend) => ({
  ...weekend,
  obs: { ...weekend.obs, race: weekend.obs.race.filter((ob) => ob.same) },
}));
const teammate = stateSpaceRun(teammateTimeline, 'race', prep.ctx, { ...base.race, ...FINAL.race });

function blend(share) {
  const change = (i, id) => share * ((teammate.pre[i].rated.get(id) ?? 0) - (main.pre[i].rated.get(id) ?? 0));
  return {
    ...main,
    pre: main.pre.map((weekend, i) => ({
      ...weekend,
      drivers: new Map([...weekend.drivers].map(([id, level]) => [id, level + change(i, id)])),
      rated: new Map([...weekend.rated].map(([id, level]) => [id, level + change(i, id)])),
    })),
    post: main.post.map((weekend, i) => ({
      ...weekend,
      drivers: new Map(
        [...weekend.drivers].map(([id, rating]) => [
          id,
          { ...rating, m: rating.m + share * ((teammate.post[i].drivers.get(id)?.m ?? rating.m) - rating.m) },
        ]),
      ),
    })),
    z: main.z.map((weekend, i) => ({
      ...weekend,
      plain: Float64Array.from(weekend.plain, (z, j) => {
        const ob = timeline[i].obs.race[j];
        return z + main.k * (change(i, ob.x) - change(i, ob.y));
      }),
      adj: Float64Array.from(weekend.adj, (z, j) => {
        const ob = timeline[i].obs.race[j];
        const attenuation = Math.sqrt(1 + (Math.PI / 8) * main.k * main.k * weekend.vari[j]);
        return z + (main.k * (change(i, ob.x) - change(i, ob.y))) / attenuation;
      }),
    })),
  };
}

function rankMovement(candidate, from, to) {
  let displacement = 0;
  let entries = 0;
  let reversals = 0;
  let pairs = 0;
  for (const [i, weekend] of timeline.entries()) {
    if (weekend.year < from || weekend.year > to) continue;
    const ids = [...main.post[i].drivers.keys()];
    const ranks = (run) => new Map(ids.slice().sort((a, b) => run.post[i].drivers.get(b).m - run.post[i].drivers.get(a).m).map((id, rank) => [id, rank]));
    const oldRanks = ranks(main);
    const newRanks = ranks(candidate);
    for (const id of ids) {
      displacement += Math.abs(oldRanks.get(id) - newRanks.get(id));
      entries++;
    }
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      reversals += Number((oldRanks.get(ids[a]) - oldRanks.get(ids[b])) * (newRanks.get(ids[a]) - newRanks.get(ids[b])) < 0);
      pairs++;
    }
  }
  return { meanAbsoluteRankChange: displacement / entries, pairReversalRate: reversals / pairs };
}

for (const share of [0, 0.25, 0.5, 0.75, 1]) {
  const race = blend(share);
  const res = evaluateModel(timeline, prep.identity, { race, qual }, { boot: { B: 0 } });
  const { loss } = summarise(res);
  const fitRows = observationRows(idx, race).filter((r) => r.year >= 2002 && r.year <= 2007 && !r.same);
  const slope = fitSlope(fitRows);
  const strict = strictScores(idx, race, slope, { moves, windows: [['2002-11', 2002, 2011], ['2012-15', 2012, 2015], ['2016+', 2016, 9999]] });
  console.log(JSON.stringify({
    share,
    loss: Object.fromEntries(['fit', 'w2', 'w3', 'holdout'].map((w) => [w, {
      all: loss[`${w}.combined.all`],
      mates: loss[`${w}.combined.mates`],
    }])),
    movers: Object.fromEntries(['2002-11', '2012-15', '2016+'].map((w) => [w, {
      teammateLoss5: strict[`${w}.k5`]?.tmLoss,
      teammateSlope5: strict[`${w}.k5`]?.tmSlope,
    }])),
    rankMovement: { late: rankMovement(race, 2012, 2015), recent: rankMovement(race, 2024, 2025) },
  }));
}
