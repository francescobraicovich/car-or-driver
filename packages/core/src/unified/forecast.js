// Forecasts are projections of the unified posterior, with explicit risk.
import { headToHeadWithHazard } from '../hazard.js';
import { pToRating } from '../math.js';

export const POINTS = 75 / Math.LN10;
export const expit = (value) => 1 / (1 + Math.exp(-value));
export const isUnified = (model) => model?.params?.modelKind === 'unified';
export const calibratedProbability = (mean, variance, slope) => expit((slope * mean) / Math.sqrt(1 + (Math.PI * variance) / 8));

export function calibrationFor(model, year) {
  return model.forecastState.calibrations.findLast((entry) => entry.fromYear <= year) ?? { overall: { slope: 1 } };
}

export function gridProbability(mean, variance, gridA, gridB, head) {
  return expit((head.ratingCoefficient * mean) / Math.sqrt(1 + (Math.PI * variance) / 8) + (head.gridCoefficient * (gridB - gridA)) / 10);
}

function gridPosition(value) {
  if (value == null || value === '' || value === 0) return null;
  const position = Number(value);
  if (!Number.isInteger(position) || position < 1 || position > 40) throw Error('Grid positions must be integers from 1 to 40, or blank.');
  return position;
}

/** Combine repeated entities first: the covariance of a shared car cancels. */
export function gapVariance(state, terms, covariance = state.covariance) {
  const coefficients = new Map();
  for (const [kind, id, sign] of terms) {
    const index = state.keys.findIndex(([k, identity]) => k === kind && identity === id);
    if (index < 0) throw Error(`Missing unified state: ${kind} ${id}`);
    coefficients.set(index, (coefficients.get(index) ?? 0) + sign);
  }
  let variance = 0;
  for (const [i, a] of coefficients) for (const [j, b] of coefficients) variance += a * b * covariance[i][j];
  return Math.max(0, variance);
}

export function prepareUnifiedForecast(model, options = {}) {
  if (!isUnified(model)) throw Error('Unified forecasts require unified ratings.');
  if (options.circuitId || options.qrows?.length || options.wet)
    throw Error('Qualifying-session, circuit and weather adjustments are not fitted; use pre-weekend ratings or a known grid.');
  const snap = model.snaps.at(-1);
  const nextDate = options.date ?? new Date(Date.parse(snap.date) + 7 * 86400000).toISOString().slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(nextDate) ||
    !Number.isFinite(Date.parse(nextDate)) ||
    new Date(nextDate).toISOString().slice(0, 10) !== nextDate ||
    nextDate < snap.date
  )
    throw Error('Forecast date must be an ISO date on or after the latest weekend.');
  const year = +nextDate.slice(0, 4);
  const calibration = calibrationFor(model, year);
  const elapsed = (Date.parse(nextDate) - Date.parse(snap.date)) / (365.25 * 86400000);
  const parameters = model.params.parameters;
  const driverVariance = ((4 * parameters.driver_multiplier) / POINTS) ** 2 * elapsed;
  const carVariance = (9 + (year !== snap.year ? 225 : 0)) * (parameters.car_multiplier / POINTS) ** 2;
  return (idA, idB, { L = 60, gridA, gridB } = {}) => {
    gridA = gridPosition(gridA);
    gridB = gridPosition(gridB);
    if (gridA && gridB && gridA === gridB) throw Error('The two drivers must have different grid positions.');
    if (!Number.isInteger(L) || L < 1 || L > 100) throw Error('Race distance must be an integer from 1 to 100 laps.');
    if (idA === idB) return null;
    const a = snap.drivers.find((row) => row.driverId === String(idA));
    const b = snap.drivers.find((row) => row.driverId === String(idB));
    if (!a || !b) return null;
    const carA = snap.cars.find((row) => row.constructorId === a.constructorId);
    const carB = snap.cars.find((row) => row.constructorId === b.constructorId);
    const terms = [
      ['driver', a.driverId, 1],
      ['driver', b.driverId, -1],
      ['car', carA.carId, 1],
      ['car', carB.carId, -1],
    ];
    const drift = 2 * driverVariance + (carA.carId === carB.carId ? 0 : 2 * carVariance);
    const gap = a.overall - b.overall + carA.overall - carB.overall;
    const variance = gapVariance(snap.unified, terms) + drift;
    const raw = expit(gap / POINTS);
    const calibrated = calibratedProbability(gap / POINTS, variance, calibration.overall.slope);
    const gridHead = gridA && gridB ? model.forecastState.gridHeads?.findLast((head) => head.fromYear <= year) : null;
    if (gridA && gridB && !gridHead) throw Error('A fitted grid forecast is not available for this model.');
    const competitive = gridHead ? gridProbability(gap / POINTS, variance, gridA, gridB, gridHead) : calibrated;
    const qA = 1 - (1 - a.q) * (1 - carA.q);
    const qB = 1 - (1 - b.q) * (1 - carB.q);
    const p = headToHeadWithHazard(competitive, qA, qB, L);
    const timing = {};
    for (const [index, channel] of ['qual', 'race'].entries()) {
      const fit = calibration[channel];
      const timingGap = (a[channel] - b[channel] + carA[channel] - carB[channel]) / POINTS;
      const timingVariance = gapVariance(snap.unified, terms, snap.unified.timingCovariance[index]) + drift;
      const mean = fit.slope * timingGap * 0.003;
      const scale = Math.sqrt(fit.noise ** 2 + (3 * fit.slope ** 2 * timingVariance) / Math.PI ** 2) * 0.003;
      timing[channel] = { fractionalTimeAdvantage: mean, predictiveInterval90: [mean - Math.log(19) * scale, mean + Math.log(19) * scale] };
    }
    return {
      snap,
      a,
      b,
      carA,
      carB,
      p,
      pPace: raw,
      competitive,
      qA,
      qB,
      L,
      gap,
      sd: Math.sqrt(variance) * POINTS,
      date: nextDate,
      calibrationThrough: gridHead?.trainedThrough ?? calibration.trainedThrough,
      forecastMode: gridHead ? 'grid' : 'pre',
      gridA,
      gridB,
      timing,
      edge: pToRating(p, 75) - 1000,
      breakdown: { ratings: raw, calibrated, ...(gridHead ? { grid: competitive } : {}), full: p },
      gridNote: gridHead
        ? 'Race-result forecast conditional on the supplied starting grid, including retirement risk.'
        : 'Pre-weekend race-result forecast, including retirement risk.',
    };
  };
}

export function forecastPreWeekend(model, idA, idB, options = {}) {
  if (options.gridA > 0 || options.gridB > 0) throw Error('Use forecastRace for a known starting grid.');
  return prepareUnifiedForecast(model, options)(idA, idB, options);
}

export function forecastRace(model, idA, idB, options = {}) {
  return prepareUnifiedForecast(model, options)(idA, idB, options);
}
