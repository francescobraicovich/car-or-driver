// The forecast layer on the state-space ratings, replayed over the captured weekends.
//
// The exam's observations do not depend on any rating, so the filters can run first and the form trackers and
// probability heads can then be replayed with the state-space levels as their rating inputs. The same function
// trains (heads = null, `onRow` receives every feature row) and builds (heads given, per-weekend diagnostics out).
import { FormFeatures } from '../forecast/form.js';
import { scoreHead, selectHeads } from '../forecast/inference.js';
import { pairHazard, ssBaseline, ssGap } from './inputs.js';

function accumulator() {
  return { loss: 0, brier: 0, hits: 0, weight: 0 };
}
function add(a, y, p, w) {
  a.weight += w;
  a.loss -= w * Math.log(Math.max(1e-12, y ? p : 1 - p));
  a.brier += w * (y - p) ** 2;
  a.hits += w * +(p > 0.5 === !!y);
}
const mean = (a, key) => (a.weight ? a[key] / a.weight : NaN);

/**
 * @param weekends  captured weekends: { info, rawRows, qrows, raceSeen, preQ, replayObs: [{ ob, session, weight }] }
 * @param pre       { race: [{drivers, cars}], qual: [{drivers, cars}] } levels before each weekend (filter output)
 * @param opts      { lapPace, params, heads (STATE_SPACE_HEADS or null), onRow(row) }
 * @returns         { form, diags: per weekend { logLoss, brier, acc, preLogLoss, preBrier, preAcc, q: {...} } }
 */
export function replayForecastLayer(weekends, pre, { lapPace, params, heads: allHeads = null, onRow = null }) {
  const form = new FormFeatures(lapPace);
  const diags = [];
  weekends.forEach((wk, i) => {
    const maps = { D: pre.race[i].drivers, C: pre.race[i].cars, QD: pre.qual[i].drivers, QC: pre.qual[i].cars };
    form.beforeWeekend({ info: wk.info, rows: wk.rawRows, qrows: wk.qrows, raceSeen: wk.raceSeen, ...maps });
    const heads = allHeads ? selectHeads(allHeads, wk.info.year) : null;
    const cache = new Map();
    const acc = { race: accumulator(), pre: accumulator(), qual: accumulator() };
    for (const { ob, session, weight } of wk.replayObs) {
      const base = ssBaseline(
        session,
        ssGap(session, maps, ob.x, ob.y),
        session === 'qual' ? 0 : pairHazard(wk.preQ, ob.x),
        session === 'qual' ? 0 : pairHazard(wk.preQ, ob.y),
        params,
      );
      const key = `${session}|${ob.x.driverId}|${ob.y.driverId}`;
      let predicted = cache.get(key);
      const needFeatures = heads || onRow;
      const f = needFeatures && (!predicted || onRow) ? form.features(ob.x, ob.y, session, base, base) : null;
      if (!predicted) {
        predicted =
          session === 'qual'
            ? { qual: heads ? scoreHead(heads.qual, f) : base }
            : { post: heads ? scoreHead(heads.post, f) : base, pre: heads ? scoreHead(heads.pre, f) : base };
        cache.set(key, predicted);
      }
      onRow?.({ info: wk.info, weekend: form.weekend, session, ob, weight, base, features: f, predicted });
      if (session === 'qual') add(acc.qual, ob.obs, predicted.qual, weight);
      else {
        add(acc.race, ob.obs, predicted.post, weight);
        add(acc.pre, ob.obs, predicted.pre, weight);
      }
    }
    form.afterWeekend({ info: wk.info, rows: wk.rawRows });
    diags.push({
      logLoss: mean(acc.race, 'loss'),
      brier: mean(acc.race, 'brier'),
      acc: mean(acc.race, 'hits'),
      preLogLoss: mean(acc.pre, 'loss'),
      preBrier: mean(acc.pre, 'brier'),
      preAcc: mean(acc.pre, 'hits'),
      q: { logLoss: mean(acc.qual, 'loss'), brier: mean(acc.qual, 'brier'), acc: mean(acc.qual, 'hits') },
    });
  });
  return { form, diags };
}
