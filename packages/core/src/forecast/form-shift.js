// "Rating with recent form": how many rating points the forecast model's recent-
// form signals add to (or take from) each driver's race rating.
//
// The forecast compares pairs of drivers. Run it for every pair on the grid twice,
// once as shipped and once with the form signals switched off (`withoutForm`); the
// difference in log-odds for a pair is what form contributes to that pair. Those
// pairwise contributions are then explained by one number per driver, fitted by
// least squares (a Bradley–Terry fit), and converted to rating points with the
// backbone's own scale. Calibration and retirement risk are shared by both
// forecasts and cancel.
//
// The form signals describe the driver and the car together, so the raw shift is
// mostly a statement about each car (on today's grid it runs from about -87 to
// +64 points, with both drivers of a team moving together). A driver's rating
// excludes the car, so the team's average is removed: what is left is how a
// driver's recent form compares with their teammate's, the same contrast the
// ratings themselves are built on. Shifts therefore sum to zero within a team
// (a lone driver gets none).
import { prepareForecast } from './prepare.js';

const logit = (p) => {
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(q / (1 - q));
};

/**
 * Least-squares fit of one number per entity to a complete antisymmetric matrix.
 * `delta(a, b)` is the log-odds advantage of `a` over `b`. For a complete matrix
 * the solution is the row mean, theta_i = (1/N) * sum_j delta(i, j), and the
 * thetas sum to zero. Returns Map(id -> theta).
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
  return new Map([...sums].map(([id, s]) => [id, s / ids.length]));
}

/** Subtract each team's mean so only the contrast between teammates remains. */
export function removeTeamMean(values, teamOf) {
  const teams = new Map();
  for (const [id, v] of values) {
    const t = teamOf(id);
    if (!teams.has(t)) teams.set(t, []);
    teams.get(t).push(v);
  }
  const mean = new Map([...teams].map(([t, vs]) => [t, vs.reduce((s, v) => s + v, 0) / vs.length]));
  return new Map([...values].map(([id, v]) => [id, v - mean.get(teamOf(id))]));
}

const cache = new WeakMap();

/**
 * Form shift in rating points for every driver on the latest grid, or null when
 * the model cannot forecast (no forecast layer, or no grid). Cached per model.
 */
export function formShifts(model) {
  if (!model.forecastState?.form || !model.snaps?.length) return null;
  if (cache.has(model)) return cache.get(model);
  const forecast = prepareForecast(model);
  const ids = model.snaps.at(-1).drivers.map((d) => String(d.driverId));
  const pairs = new Map();
  const delta = (a, b) => {
    const r = forecast(a, b);
    pairs.set(`${a}|${b}`, r);
    return logit(r.breakdown.full) - logit(r.breakdown.calibrated);
  };
  const thetas = fitShifts(ids, delta);
  const perLogit = model.params.scale / Math.LN10; // rating points per unit of log-odds
  const points = new Map([...thetas].map(([id, theta]) => [id, theta * perLogit]));
  const team = new Map(model.snaps.at(-1).drivers.map((d) => [String(d.driverId), d.constructorId]));
  const out = removeTeamMean(points, (id) => team.get(id));
  cache.set(model, out);
  return out;
}
