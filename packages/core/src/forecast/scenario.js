// "What if" head to head: any driver at any moment of their career, in any car at
// any moment of that car's history, in dry or wet conditions.
//
// The model keeps a driver rating and a car rating after every weekend, and a race
// is predicted from their sum, so a matchup can be assembled from parts that never
// met: driver A as of one date plus car X as of another. A scenario has no real
// weekend behind it, so there is no recent form and no qualifying result to use. The
// probability is the rating model's own (rating gap blended with retirement risk),
// recalibrated by one fitted scale. The fitted heads are not used: they were trained
// on form signals that agree with the ratings, and with the form emptied they
// under-state large gaps (a 120-point car gap came out near 88% instead of 99%).
//
// A rating is relative to the field of its own time, so comparing eras assumes the
// rating scale carries across seasons. It is a thought experiment, not a measurement.
import { pToRating } from '../math.js';
import { isHomeRace } from '../geography.js';

const logit = (p) => Math.log(p / (1 - p));
const expit = (z) => 1 / (1 + Math.exp(-z));

export { resolveMoment, resolveSide } from './moments.js';
import { resolveSide } from './moments.js';
import { isUnified } from '../unified/forecast.js';
import { scenarioForecast as unifiedScenario } from '../unified/scenario.js';

/**
 * Forecast a constructed matchup. Returns { error } when a part cannot be resolved,
 * otherwise the probability that A finishes ahead of B with the pieces that made it.
 */
export function scenarioForecast(model, A, B, { wet = false, circuitId = '', L = 60 } = {}) {
  if (isUnified(model)) return unifiedScenario(model, A, B, { wet, circuitId, L });
  if (!model.forecastState) return { error: 'Scenarios need a model with a forecast layer.' };
  const a = resolveSide(model, A);
  if (a.error) return { error: a.error };
  const b = resolveSide(model, B);
  if (b.error) return { error: b.error };
  const params = model.params;

  const components = {
    driver: a.driver.race - b.driver.race,
    car: a.car.race - b.car.race,
    wet: 0,
    track: 0,
  };
  if (wet) components.wet = (model.wetFinal?.get(A.driverId) ?? 0) - (model.wetFinal?.get(B.driverId) ?? 0);
  if (circuitId) {
    components.track = (model.affFinal?.get(A.driverId)?.get(circuitId) || 0) - (model.affFinal?.get(B.driverId)?.get(circuitId) || 0);
    const country = model.forecastState.countries.get(circuitId);
    if (country)
      components.track +=
        params.homeAdv *
        (+isHomeRace(model.forecastState.nationalities.get(A.driverId), country) -
          +isHomeRace(model.forecastState.nationalities.get(B.driverId), country));
  }
  const gap = components.driver + components.car + components.wet + components.track;
  const qA = 1 - (1 - a.driver.q) * (1 - a.car.q);
  const qB = 1 - (1 - b.driver.q) * (1 - b.car.q);
  const sameCar =
    a.constructorId === b.constructorId &&
    a.car.points.length === b.car.points.length &&
    a.car.points.every((p, i) => p.raceId === b.car.points[i].raceId);
  const clamp = (p) => Math.min(1 - 1e-9, Math.max(1e-9, p));
  const fit = model.ss.scenario;
  const pPace = expit((Math.LN10 / params.scale) * gap);
  const prior = pPace;
  const kappa = sameCar ? fit.teammates : fit.cars;
  const dry = expit(kappa * logit(clamp(pPace)));
  const p = wet ? expit(kappa * fit.wetRatio * logit(clamp(pPace))) : dry;
  return {
    p,
    dry,
    pPace,
    prior,
    gap,
    components,
    wet,
    L,
    qA,
    qB,
    a,
    b,
    sameCar,
    edge: pToRating(p, params.scale) - 1000,
    breakdown: { ratings: pPace, calibrated: p, full: p },
  };
}
