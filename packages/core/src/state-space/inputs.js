// The rating-side inputs of the forecast layer (form trackers and probability heads) on the state-space ratings.
//
// One place defines how a state-space level becomes a forecast input, and training (the replay that exports rows),
// the build and serving (head to head) all call it. A second copy of this formula is exactly how a train/serve
// mismatch gets in, so there is no second copy.
import { headToHeadWithHazard } from '../hazard.js';
import { STATE_SPACE } from '../presets/state-space.js';
import { STATE_SPACE_FIT } from '../presets/state-space-fit.js';

const K = { race: Math.LN10 / STATE_SPACE.race.s, qual: Math.LN10 / STATE_SPACE.qual.s };
const expit = (z) => 1 / (1 + Math.exp(-z));

/** The ratings' pace probability for a gap, at the fitted slope, with no hazard. */
export const ssPace = (session, gap) => expit(STATE_SPACE_FIT.slopes[session] * K[session] * gap);

/** Hazard of a driver in a car: the chance either fails, per lap, from the pre-weekend hazard tables. */
export function pairHazard(preQ, row) {
  return 1 - (1 - preQ.inc.get(row.driverId)) * (1 - preQ.rel.get(row.constructorId));
}

/**
 * The pace probability the heads start from, for the gap `gap` (driver plus car, A minus B, in rating points).
 * Race: the ratings' fitted slope, then the hazard mix the heads were built with. Qualifying: no hazard.
 * Means only (no covariance), so serving needs nothing beyond the levels.
 */
export function ssBaseline(session, gap, qA, qB, params) {
  const p = ssPace(session, gap);
  if (session === 'qual') return p;
  const w = params.hazardW;
  return (1 - w) * p + w * headToHeadWithHazard(p, qA, qB, params.stdLaps);
}

/** Rating gap of a pair in a session, from level maps {D, C, QD, QC}. */
export function ssGap(session, maps, x, y) {
  const [D, C] = session === 'qual' ? [maps.QD, maps.QC] : [maps.D, maps.C];
  const get = (m, id) => {
    const v = m.get(id);
    if (!Number.isFinite(v)) throw Error(`state-space level missing for ${id}`);
    return v;
  };
  return get(D, x.driverId) - get(D, y.driverId) + (get(C, x.constructorId) - get(C, y.constructorId));
}

/** Level maps from a filter's `latest` state (one step ahead), for serving. */
export function levelsFromLatest(latest) {
  const nd = latest.driverIds.length;
  return {
    drivers: new Map(latest.driverIds.map((id, i) => [id, latest.mean[i]])),
    cars: new Map(latest.carIds.map((id, i) => [id, latest.mean[nd + i]])),
  };
}
