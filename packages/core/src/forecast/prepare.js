import { FormFeatures, withoutForm } from './form.js';
import { ELO_HEADS } from '../elo-forecast-heads.js';
import { scoreHead, selectHeads } from './inference.js';
import { gapToP, pToRating } from '../math.js';
import { headToHeadWithHazard } from '../hazard.js';
import { isHomeRace } from '../geography.js';
import { STATE_SPACE_HEADS } from '../state-space/forecast-heads.js';
import { levelsFromLatest, ssBaseline, ssGap, ssPace } from '../state-space/inputs.js';

/**
 * The probability the Elo heads start from (their `baseline` feature).
 *
 * It must be computed exactly as during training, i.e. at the backbone's own
 * scale and with its own hazard weight and standard race length. (Serving once
 * used a fixed scale of 150 and the caller's lap count, which does not match a
 * backbone tuned at 75 and skewed forecasts by ~1.6 points on average.)
 */
export function baselineProbability(params, diff, qA, qB) {
  const pPace = gapToP(diff, params.scale);
  const hazardW = params.hazardW;
  return { pPace, prior: (1 - hazardW) * pPace + hazardW * headToHeadWithHazard(pPace, qA, qB, params.stdLaps) };
}

/** Whether a model carries the state-space ratings (otherwise the Elo ratings). */
export const isStateSpace = (model) => model?.params?.modelKind === 'state-space';

/** The latest weekend: the grid, the teams and the reliability hazards the forecast starts from. */
function forecastSnap(model) {
  return model.snaps.at(-1);
}

/** The state-space levels a forecast reads: the filter's final state, one weekend ahead (see state-space/inputs.js). */
function ssLevelMaps(model) {
  const race = levelsFromLatest(model.ss.latest.race);
  const qual = levelsFromLatest(model.ss.latest.qual);
  return { D: race.drivers, C: race.cars, QD: qual.drivers, QC: qual.cars };
}

/**
 * Load the model's final form state once and return `forecast(idA, idB, opts)`.
 * Supply `qrows` for a full race-day forecast. With grid slots only, the
 * separately fitted grid head is used; with neither, the Thursday head.
 */
export function prepareForecast(model, { circuitId = '', qrows = [], year, round } = {}) {
  const s = forecastSnap(model);
  if (!s) return null;
  const params = model.params;
  const rows = s.drivers.map((d) => ({ driverId: d.driverId, constructorId: d.constructorId, grid: 0 }));
  const form = new FormFeatures(null);
  form.importState(model.forecastState.form);
  const info = { ...s, year: year ?? s.year, round: round ?? s.round + 1, circuitId };
  const stateSpace = isStateSpace(model);
  const levels = stateSpace
    ? ssLevelMaps(model)
    : {
        D: new Map(s.drivers.map((d) => [d.driverId, d.race])),
        C: new Map(s.cars.map((c) => [c.constructorId, c.race])),
        QD: new Map(s.drivers.map((d) => [d.driverId, d.qual])),
        QC: new Map(s.cars.map((c) => [c.constructorId, c.qual])),
      };
  form.beforeWeekend({ info, rows, qrows, ...levels, raceSeen: model.forecastState.seen });
  const heads = selectHeads(stateSpace ? STATE_SPACE_HEADS : ELO_HEADS, info.year);

  return function forecast(idA, idB, { L = 60, gridA, gridB } = {}) {
    const a = s.drivers.find((d) => d.driverId === idA);
    const b = s.drivers.find((d) => d.driverId === idB);
    if (!a || !b) return null;
    const carA = s.cars.find((c) => c.constructorId === a.constructorId);
    const carB = s.cars.find((c) => c.constructorId === b.constructorId);
    const x = { driverId: idA, constructorId: a.constructorId, grid: gridA };
    const y = { driverId: idB, constructorId: b.constructorId, grid: gridB };
    const qA = 1 - (1 - a.q) * (1 - carA.q);
    const qB = 1 - (1 - b.q) * (1 - carB.q);
    let diff;
    let pPace;
    let prior;
    if (stateSpace) {
      // state-space gap; the baseline has no circuit term (the heads were trained without one)
      diff = ssGap('race', levels, x, y);
      pPace = ssPace('race', diff);
      prior = ssBaseline('race', diff, qA, qB, params);
    } else {
      diff = a.race - b.race + carA.race - carB.race;
      if (circuitId) {
        diff += (model.affFinal?.get(idA)?.get(circuitId) || 0) - (model.affFinal?.get(idB)?.get(circuitId) || 0);
        const country = model.forecastState.countries.get(circuitId);
        if (country)
          diff +=
            params.homeAdv *
            (+isHomeRace(model.forecastState.nationalities.get(idA), country) -
              +isHomeRace(model.forecastState.nationalities.get(idB), country));
      }
      ({ pPace, prior } = baselineProbability(params, diff, qA, qB));
    }
    const f = form.features(x, y, 'race', prior, prior);
    const hasGrid = Number.isFinite(gridA) && Number.isFinite(gridB) && gridA > 0 && gridB > 0;
    const mode = qrows.length >= 2 && hasGrid ? 'post' : hasGrid ? 'grid' : 'pre';
    const p = heads ? scoreHead(heads[mode], f) : prior;
    return {
      snap: s,
      a,
      b,
      carA,
      carB,
      p,
      pPace,
      qA,
      qB,
      L,
      forecastMode: mode,
      edge: pToRating(p, params.scale) - 1000,
      // How the headline is built up: ratings alone, then the fitted model with
      // recent form switched off, then the full forecast.
      gap: diff,
      breakdown: { ratings: pPace, calibrated: heads ? scoreHead(heads[mode], withoutForm(f)) : pPace, full: p },
      gridNote: ` · ${mode === 'post' ? 'full qualifying evidence' : mode === 'grid' ? 'grid-only forecast' : 'Thursday forecast'}; predicts the pace/finishing-order benchmark, conditional on its coverage`,
    };
  };
}

export function forecastPair(model, idA, idB, { L = 60, circuitId = '', gridA, gridB, qrows = [], year, round } = {}) {
  const forecast = prepareForecast(model, { circuitId, qrows, year, round });
  return forecast ? forecast(idA, idB, { L, gridA, gridB }) : null;
}
