// "Rating with recent form": the forecast model's driver-specific form contribution,
// expressed as a globally centred adjustment in rating points.
import { prepareForecast } from './prepare.js';

const logit = (p) => {
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(q / (1 - q));
};

/**
 * Least-squares fit of one number per entity to a complete antisymmetric matrix.
 * The fit is globally centred; interactions and non-additive effects make each
 * driver's result an approximation to the model's pairwise form contribution.
 */
export function fitShifts(ids, delta) {
  const sums = new Map(ids.map((id) => [id, 0]));
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const d = delta(ids[i], ids[j]);
      sums.set(ids[i], sums.get(ids[i]) + d);
      sums.set(ids[j], sums.get(ids[j]) - d);
    }
  }
  return new Map([...sums].map(([id, sum]) => [id, sum / ids.length]));
}

/** Historical research contrast; the published driver-form display does not use it. */
export function removeTeamMean(values, teamOf) {
  const teams = new Map();
  for (const [id, value] of values) {
    const team = teamOf(id);
    if (!teams.has(team)) teams.set(team, []);
    teams.get(team).push(value);
  }
  const means = new Map([...teams].map(([team, rows]) => [team, rows.reduce((sum, value) => sum + value, 0) / rows.length]));
  return new Map([...values].map(([id, value]) => [id, value - means.get(teamOf(id))]));
}

const cache = new WeakMap();

/** Driver-specific form shift in rating points for every driver on the latest grid. */
export function formShifts(model) {
  if (!model.forecastState?.form || !model.snaps?.length) return null;
  if (cache.has(model)) return cache.get(model);
  const forecast = prepareForecast(model);
  const ids = model.snaps.at(-1).drivers.map((driver) => String(driver.driverId));
  const delta = (a, b) => {
    const result = forecast(a, b);
    return logit(result.breakdown.full) - logit(result.breakdown.driverFormOff);
  };
  const perLogit = model.params.scale / Math.LN10;
  const out = new Map([...fitShifts(ids, delta)].map(([id, value]) => [id, value * perLogit]));
  cache.set(model, out);
  return out;
}

const carCache = new WeakMap();

/** Average the pairwise car-form contribution across each pair of cars. */
export function carFormShifts(model) {
  if (!model.forecastState?.form || !model.snaps?.length) return null;
  if (carCache.has(model)) return carCache.get(model);
  const forecast = prepareForecast(model);
  const groups = new Map();
  for (const driver of model.snaps.at(-1).drivers) {
    const car = String(driver.constructorId);
    if (!groups.has(car)) groups.set(car, []);
    groups.get(car).push(String(driver.driverId));
  }
  const ids = model.snaps
    .at(-1)
    .cars.map((car) => String(car.constructorId))
    .filter((id) => groups.has(id));
  const delta = (a, b) => {
    let sum = 0;
    let count = 0;
    for (const x of groups.get(a))
      for (const y of groups.get(b)) {
        const result = forecast(x, y);
        sum += logit(result.breakdown.full) - logit(result.breakdown.carFormOff);
        count++;
      }
    return sum / count;
  };
  const perLogit = model.params.scale / Math.LN10;
  const result = new Map([...fitShifts(ids, delta)].map(([id, value]) => [id, value * perLogit]));
  carCache.set(model, result);
  return result;
}
