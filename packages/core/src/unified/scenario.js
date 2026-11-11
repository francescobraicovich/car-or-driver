// Dated what-if comparisons use the same overall rating and probability link.
import { resolveSide } from '../forecast/moments.js';
import { headToHeadWithHazard } from '../hazard.js';
import { pToRating } from '../math.js';
import { POINTS, expit, calibratedProbability, calibrationFor, gapVariance } from './forecast.js';

export function scenarioForecast(model, A, B, { L = 60, wet = false, circuitId = '' } = {}) {
  if (wet || circuitId) return { error: 'The unified model has no fitted weather or circuit adjustment.' };
  if (!Number.isInteger(L) || L < 1 || L > 100) return { error: 'Choose an integer distance from 1 to 100 laps.' };
  const a = resolveSide(model, A);
  const b = resolveSide(model, B);
  if (a.error || b.error) return { error: a.error || b.error };
  const components = { driver: a.driver.overall - b.driver.overall, car: a.car.overall - b.car.overall };
  const gap = components.driver + components.car;
  const groups = new Map();
  for (const [side, sign] of [
    [a, 1],
    [b, -1],
  ]) {
    for (const [kind, point, identity] of [
      ['driver', side.driver.points[0], side.driverId],
      ['car', side.car.points[0], side.car.points[0].carId],
    ]) {
      const terms = groups.get(point.raceId) ?? [];
      terms.push([kind, identity, sign]);
      groups.set(point.raceId, terms);
    }
  }
  let variance = 0;
  for (const [raceId, terms] of groups) {
    const snapshot = model.snaps.find((snap) => snap.raceId === raceId);
    variance += gapVariance(snapshot.unified, terms);
  }
  // Cross-date covariance is not stored: this is an explicit approximation.
  const approximate = groups.size > 1;
  const latest = model.snaps.at(-1);
  const calibration = calibrationFor(model, latest.year);
  const raw = expit(gap / POINTS);
  const competitive = calibratedProbability(gap / POINTS, variance, calibration.overall.slope);
  const qA = 1 - (1 - a.driver.q) * (1 - a.car.q);
  const qB = 1 - (1 - b.driver.q) * (1 - b.car.q);
  const p = headToHeadWithHazard(competitive, qA, qB, L);
  const sameCar = a.car.constructorId === b.car.constructorId && a.car.to === b.car.to;
  return {
    p,
    pPace: raw,
    competitive,
    gap,
    components,
    qA,
    qB,
    a,
    b,
    L,
    sameCar,
    approximate,
    sd: Math.sqrt(variance) * POINTS,
    edge: pToRating(p, 75) - 1000,
    breakdown: { ratings: raw, calibrated: competitive, full: p },
  };
}
