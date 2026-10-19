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
// Elo chain carries across seasons. It is a thought experiment, not a measurement.
import { baselineProbability, isStateSpace } from './prepare.js';
import { pToRating } from '../math.js';
import { isHomeRace } from '../geography.js';

/**
 * The rating model's own probability (before any fitted head) is under-confident: its Elo scale
 * was tuned for how fast ratings update, not for calibration. Multiplying its log-odds by this
 * scale minimises log-loss on the race pairs of 2015 and earlier. Different cars: 1.22 in
 * 2001-07, 1.22 in 2008-11, 1.22 in 2012-15, 1.23 pooled. Teammates are noisier: 1.25, 1.26,
 * 1.00 by era, 1.17 pooled. Fitted out of sample (to 2011, scored on 2012-15) it takes loss from
 * 0.3762 to 0.3728, against 0.3609 for the full forecast with form and qualifying.
 * Used for the Elo model; the state-space model has its own fitted stretch (presets/state-space-fit.js).
 */
export const RATINGS_SCALE = { cars: 1.23, teammates: 1.17 };

/**
 * Wet races are harder to call. On the 33 wet weekends of 2015 and earlier the best scale is
 * 1.01 (95% interval 0.87-1.15 over weekends) against 1.25 on dry weekends, a ratio of 0.81, and
 * loss was 0.441 against 0.384. Wet forecasts use the dry scale times this ratio.
 */
export const WET_RATIO = 0.81;
const logit = (p) => Math.log(p / (1 - p));
const expit = (z) => 1 / (1 + Math.exp(-z));

const mean = (xs, pick) => xs.reduce((s, x) => s + pick(x), 0) / xs.length;
const shortName = (name) => String(name || '').replace(/ Grand Prix$/, ' GP');
const DAY = 86400000;

function describe(points) {
  const first = points[0];
  const last = points[points.length - 1];
  const at = (p) => `${p.year} ${shortName(p.name)}`;
  if (points.length === 1) return at(first);
  return first.year === last.year ? `${first.year} season, ${points.length} weekends` : `${first.year}–${last.year}`;
}

/** Average ratings over a set of weekends (one weekend gives that weekend's values). */
function summarize(points, extra = {}) {
  return {
    points,
    race: mean(points, (p) => p.race),
    qual: mean(points, (p) => p.qual),
    q: mean(points, (p) => p.q),
    label: describe(points),
    from: points[0].date,
    to: points[points.length - 1].date,
    note: '',
    ...extra,
  };
}

/**
 * Pick the weekends a "moment" refers to from a chronological list of rating points.
 *   { kind: 'latest' }            the most recent appearance
 *   { kind: 'date', date }        the rating after the last weekend on or before that date
 *   { kind: 'prime' }             the weekend with the highest rating
 * A date outside the entity's career is clamped to the nearest end and says so.
 */
export function resolveMoment(points, when = { kind: 'latest' }) {
  if (!points?.length) return null;
  if (when.kind === 'prime') {
    // The weekend after which the rating was highest. A rating is already an average of the
    // past, so averaging a stretch of weekends again would lag a rising career and could put
    // a "prime" below today's rating.
    const peak = points.reduce((best, p) => (p.race > best.race ? p : best));
    return summarize([peak], { prime: true });
  }
  if (when.kind === 'date') {
    const t = Date.parse(when.date);
    if (Number.isFinite(t)) {
      let index = -1;
      for (let i = 0; i < points.length; i++) if (Date.parse(points[i].date) <= t) index = i;
      if (index < 0) return summarize([points[0]], { note: `First appeared on ${points[0].date}, so that weekend is used.` });
      const last = points[points.length - 1];
      if (index === points.length - 1 && t - Date.parse(last.date) > 400 * DAY)
        return summarize([last], { note: `Last appeared on ${last.date}, so that weekend is used.` });
      return summarize([points[index]]);
    }
  }
  return summarize([points[points.length - 1]]);
}

/**
 * One side of the matchup. `side` = { driverId, when, carId, carWhen }:
 * carId '' means the car the driver actually had at that moment; otherwise `carWhen`
 * is { kind: 'same' } (the car as of the driver's weekends) or any moment as above.
 */
export function resolveSide(model, side) {
  const driverPoints = model.dh.get(side.driverId);
  const driver = resolveMoment(driverPoints, side.when);
  if (!driver) return { error: 'That driver has no rating history.' };
  const weekends = new Set(driver.points.map((p) => String(p.raceId)));
  let constructorId = side.carId;
  const own = !constructorId;
  if (own) {
    const counts = new Map();
    for (const p of driver.points) counts.set(p.constructorId, (counts.get(p.constructorId) || 0) + 1);
    constructorId = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  }
  const carPoints = model.ch.get(constructorId);
  if (!carPoints?.length) return { error: 'That car has no rating history.' };
  const carName = model.cname.get(constructorId) || constructorId;
  let car;
  if (own || !side.carWhen || side.carWhen.kind === 'same') {
    const shared = carPoints.filter((p) => weekends.has(String(p.raceId)));
    if (!shared.length)
      return {
        error: `${carName} did not race then. It raced ${carPoints[0].date.slice(0, 4)}–${carPoints[carPoints.length - 1].date.slice(0, 4)}; pick a date in that range.`,
      };
    car = summarize(
      shared,
      shared.length < driver.points.length
        ? { note: `${carName} raced in ${shared.length} of those ${driver.points.length} weekends.` }
        : {},
    );
  } else {
    car = resolveMoment(carPoints, side.carWhen);
  }
  return {
    driverId: side.driverId,
    name: model.dname.get(side.driverId) || side.driverId,
    driver,
    car: { ...car, constructorId, name: carName, own },
    constructorId,
  };
}

/**
 * Forecast a constructed matchup. Returns { error } when a part cannot be resolved,
 * otherwise the probability that A finishes ahead of B with the pieces that made it.
 */
export function scenarioForecast(model, A, B, { wet = false, circuitId = '', L = 60 } = {}) {
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
  let pPace;
  let prior;
  let dry;
  let p;
  if (isStateSpace(model)) {
    // State-space: the ratings gap is already close to calibrated, so the probability is the logistic of the gap, stretched by
    // constants fitted on the state-space ratings (state-space-fit.js). Retirement risk is shown separately.
    const fit = model.ss.scenario;
    pPace = expit((Math.LN10 / params.scale) * gap);
    prior = pPace;
    const kappa = sameCar ? fit.teammates : fit.cars;
    dry = expit(kappa * logit(clamp(pPace)));
    p = wet ? expit(kappa * fit.wetRatio * logit(clamp(pPace))) : dry;
  } else {
    // Recalibrate the rating model's own probability (see RATINGS_SCALE), more gently when wet.
    ({ pPace, prior } = baselineProbability(params, gap, qA, qB));
    const scale = sameCar ? RATINGS_SCALE.teammates : RATINGS_SCALE.cars;
    dry = expit(scale * logit(clamp(prior)));
    p = wet ? expit(scale * WET_RATIO * logit(clamp(prior))) : dry;
  }
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
