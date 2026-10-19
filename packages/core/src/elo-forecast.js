// The Elo model: the Elo-style rating core plus a forecast layer (form trackers and fitted probability heads) that
// reads the Elo ratings. It is the alternative to the default state-space model and keeps the same shape of output.
import { buildEloCore } from './elo-core.js';
import { TUNED_ELO } from './presets/tuned-elo.js';
import { FormFeatures } from './forecast/form.js';
import { ELO_HEADS } from './elo-forecast-heads.js';
import { scoreHead, selectHeads } from './forecast/inference.js';

function accumulator() {
  return { loss: 0, brier: 0, hits: 0, weight: 0 };
}
function add(a, y, p, w) {
  a.weight += w;
  a.loss -= w * Math.log(Math.max(1e-12, y ? p : 1 - p));
  a.brier += w * (y - p) ** 2;
  a.hits += w * +(p > 0.5 === !!y);
}
export function buildEloForecast(raw, lapSnapshots, maps, _params, lapPace = null) {
  if (!lapPace?.size) throw Error('The Elo model requires lap_times.csv. Load lap data first.');
  const form = new FormFeatures(lapPace);
  let acc, heads, cache;
  const model = buildEloCore(raw, lapSnapshots, maps, TUNED_ELO, lapPace, {
    beforeWeekend: (w) => {
      form.beforeWeekend(w);
      heads = selectHeads(ELO_HEADS, w.info.year);
      cache = new Map();
      acc = { race: accumulator(), pre: accumulator(), qual: accumulator() };
    },
    observation: ({ ob, session, p, pPre, weight }) => {
      const key = `${session}|${ob.x.driverId}|${ob.y.driverId}`;
      let predicted = cache.get(key);
      if (!predicted) {
        const f = heads ? form.features(ob.x, ob.y, session, p, pPre) : null;
        predicted =
          session === 'qual'
            ? { qual: heads ? scoreHead(heads.qual, f) : p }
            : { post: heads ? scoreHead(heads.post, f) : p, pre: heads ? scoreHead(heads.pre, f) : pPre };
        cache.set(key, predicted);
      }
      if (session === 'qual') add(acc.qual, ob.obs, predicted.qual, weight);
      else {
        add(acc.race, ob.obs, predicted.post, weight);
        add(acc.pre, ob.obs, predicted.pre, weight);
      }
    },
    afterWeekend: (w) => {
      form.afterWeekend(w);
      const d = w.diag;
      for (const [key, prefix] of [
        ['race', ''],
        ['pre', 'pre'],
      ]) {
        const a = acc[key];
        d[prefix ? `${prefix}LogLoss` : 'logLoss'] = a.weight ? a.loss / a.weight : NaN;
        d[prefix ? `${prefix}Brier` : 'brier'] = a.weight ? a.brier / a.weight : NaN;
        d[prefix ? `${prefix}Acc` : 'acc'] = a.weight ? a.hits / a.weight : NaN;
      }
      const a = acc.qual;
      Object.assign(d.q, {
        logLoss: a.weight ? a.loss / a.weight : NaN,
        brier: a.weight ? a.brier / a.weight : NaN,
        acc: a.weight ? a.hits / a.weight : NaN,
      });
    },
  });
  model.params.modelKind = 'elo';
  model.forecastState = {
    form: form.exportState(),
    seen: new Map(form.w.raceSeen),
    nationalities: new Map(raw.drivers.map((d) => [String(d.driverId), d.nationality])),
    countries: new Map((raw.circuits || []).map((c) => [String(c.circuitId), c.country])),
  };
  for (const r of form.w.rows) model.forecastState.seen.set(r.driverId, (model.forecastState.seen.get(r.driverId) || 0) + 1);
  return model;
}
