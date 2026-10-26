// A learning-only ablation: suppress finishing-order evidence involving a
// driver who started far behind his timed qualifying position. The unchanged
// exam scores every candidate on the same observations and weights.
import { stateSpaceRun, evaluateModel, observationRows, fitSlope } from '../packages/eval/src/index.js';
import { qualLink } from '../packages/core/src/state-space/qualifying-link.js';
import { qualifyingTreatment } from '../packages/core/src/qualifying.js';
import { strictScores } from '../packages/research/node/mover-strict.mjs';
import { summarise } from '../packages/research/node/cross-session.mjs';
import { FINAL, load } from '../packages/research/node/strict-eval.mjs';

const env = await load(2025, true);
const { timeline, prep, base, idx, moves } = env;
const qual = stateSpaceRun(timeline, 'qual', prep.ctx, base.qual);
const disadvantaged = prep.weekends.slice(0, timeline.length).map((weekend) => {
  if (weekend.year < 2006) return new Set();
  const qualified = new Map(weekend.qrows.map((row) => [row.driverId, row]));
  return new Set(
    weekend.rawRows
      .filter((row) => {
        const q = qualified.get(row.driverId);
        if (!q || qualifyingTreatment(q, weekend.year).deep === '—') return false;
        const position = +q.position;
        const grid = +row.grid;
        return position > 0 && (grid === 0 || grid >= position + 5);
      })
      .map((row) => row.driverId),
  );
});

for (const weight of [1, 0.5, 0.25, 0]) {
  const learningTimeline = timeline.map((weekend, i) => ({
    ...weekend,
    obs: {
      ...weekend.obs,
      race: weekend.obs.race.map((ob) =>
        ob.src === 'finish' && (disadvantaged[i].has(ob.x) || disadvantaged[i].has(ob.y))
          ? { ...ob, w: ob.w * weight }
          : ob,
      ),
    },
  }));
  const race = stateSpaceRun(
    learningTimeline,
    'race',
    { ...prep.ctx, ...qualLink(qual.raw, FINAL.beta, FINAL.gamma) },
    { ...base.race, ...FINAL.race },
  );
  const res = evaluateModel(timeline, prep.identity, { race, qual }, { boot: { B: 0 } });
  const { loss } = summarise(res);
  const fitRows = observationRows(idx, race).filter((row) => row.year >= 2002 && row.year <= 2007 && !row.same);
  const strict = strictScores(idx, race, fitSlope(fitRows), { moves, windows: [['2002-11', 2002, 2011], ['2012-15', 2012, 2015], ['2016+', 2016, 9999]] });
  console.log(JSON.stringify({
    weight,
    drivers: disadvantaged.reduce((sum, set) => sum + set.size, 0),
    loss: Object.fromEntries(['fit', 'w2', 'w3', 'holdout'].map((window) => [window, {
      all: loss[`${window}.combined.all`], mates: loss[`${window}.combined.mates`], cars: loss[`${window}.combined.cars`],
    }])),
    movers: Object.fromEntries(['2002-11', '2012-15', '2016+'].map((window) => [window, {
      teammateLoss5: strict[`${window}.k5`]?.tmLoss, fieldLoss5: strict[`${window}.k5`]?.fdLoss,
    }])),
  }));
}
