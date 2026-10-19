// Head to head forecast: P(driver A beats driver B over L laps).
//
// Both entry points read the model's final state (see prepare.js): the latest ratings, the reliability hazards and
// the form trackers.
import { forecastPair } from './prepare.js';

/** With grid slots (and optionally qualifying evidence) for the coming race. */
export function forecastH2H(model, idA, idB, L, grids = {}) {
  return forecastPair(model, idA, idB, { L, ...grids });
}

/** Thursday forecast: ratings, form and track only. No grid slots, no wet flag: only what is knowable before the weekend. */
export function forecastPreWeekend(model, idA, idB, { L = 60, circuitId = '' } = {}) {
  return forecastPair(model, idA, idB, { L, circuitId });
}
