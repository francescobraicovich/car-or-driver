import { isUnified, prepareUnifiedForecast } from '../unified/forecast.js';
import { withoutCarForm, withoutDriverForm, withoutForm } from './form.js';
import { createFormFeatures } from './form-method.js';
import { scoreHead, selectHeads } from './inference.js';
import { pToRating } from '../math.js';
import { levelsFromLatest, ssBaseline, ssGap, ssPace } from '../state-space/inputs.js';

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
export function prepareForecast(model, options = {}) {
  if (isUnified(model)) return prepareUnifiedForecast(model, options);
  const { circuitId = '', qrows = [], year, round } = options;
  const s = forecastSnap(model);
  if (!s) return null;
  if (!model.forecastState?.heads) throw Error('Forecast definitions missing; rebuild the model file.');
  const params = model.params;
  const rows = s.drivers.map((d) => ({ driverId: d.driverId, constructorId: d.constructorId, grid: 0 }));
  const form = createFormFeatures(null, model.forecastState.form.method ?? 'legacy');
  form.importState(model.forecastState.form);
  const info = { ...s, year: year ?? s.year, round: round ?? s.round + 1, circuitId };
  const levels = ssLevelMaps(model);
  form.beforeWeekend({ info, rows, qrows, ...levels, raceSeen: model.forecastState.seen });
  const heads = selectHeads(model.forecastState.heads, info.year);

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
    const diff = ssGap('race', levels, x, y);
    const pPace = ssPace('race', diff);
    const prior = ssBaseline('race', diff, qA, qB, params);
    const f = form.features(x, y, 'race', prior, prior);
    const hasGrid = Number.isFinite(gridA) && Number.isFinite(gridB) && gridA > 0 && gridB > 0;
    const mode = qrows.length >= 2 && hasGrid ? 'post' : hasGrid ? 'grid' : 'pre';
    const p = heads ? scoreHead(heads[mode], f) : prior;
    const driverFormOff = heads ? scoreHead(heads[mode], withoutDriverForm(f)) : pPace;
    const carFormOff = heads ? scoreHead(heads[mode], withoutCarForm(f)) : pPace;
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
      // The breakdown separates ratings, all-form-off, driver-form-off, and full forecasts.
      gap: diff,
      breakdown: {
        ratings: pPace,
        calibrated: heads ? scoreHead(heads[mode], withoutForm(f)) : pPace,
        driverFormOff,
        carFormOff,
        full: p,
      },
      gridNote: ` · ${mode === 'post' ? 'full qualifying evidence' : mode === 'grid' ? 'grid-only forecast' : 'Thursday forecast'}; predicts the pace/finishing-order benchmark, conditional on its coverage`,
    };
  };
}

export function forecastPair(model, idA, idB, options = {}) {
  const forecast = prepareForecast(model, options);
  return forecast ? forecast(idA, idB, options) : null;
}
