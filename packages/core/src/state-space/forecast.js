// The state-space ratings used on their own to forecast a pairing: the chance that A finishes ahead of B in a race, from
// the state-space ratings alone, with the uncertainty of the two ratings carried into the probability.
import { STATE_SPACE } from '../presets/state-space.js';

const expit = (z) => 1 / (1 + Math.exp(-z));

/**
 * @param {object} model  a state-space model
 * @param {string} idA    driver ids on the latest grid
 * @param {string} idB
 * @returns {{ p: number, gap: number, sd: number } | null}
 *   gap  the rating gap A minus B in points (drivers plus cars), sd its standard deviation (including the
 *        covariance between a driver and his car), p the probability with that uncertainty folded in.
 */
export function ratingsAlone(model, idA, idB) {
  const latest = model?.ss?.latest?.race;
  if (!latest) return null;
  const nd = latest.driverIds.length;
  const team = new Map(model.snaps.at(-1).drivers.map((d) => [String(d.driverId), String(d.constructorId)]));
  const entries = [];
  for (const [id, sign] of [
    [String(idA), 1],
    [String(idB), -1],
  ]) {
    const di = latest.driverIds.indexOf(id);
    const ci = latest.carIds.indexOf(team.get(id));
    if (di < 0 || ci < 0) return null;
    entries.push([di, sign], [nd + ci, sign]);
  }
  let gap = 0;
  let variance = 0;
  for (const [i, si] of entries) {
    gap += si * latest.mean[i];
    for (const [j, sj] of entries) variance += si * sj * latest.cov[i][j];
  }
  const k = Math.LN10 / STATE_SPACE.race.s;
  const scale = latest.scale ?? { report: 1, forecast: 1 }; // the probability folds in the forecast variance, the bar shows the reported one
  const z = (model.ss.slopes.race * k * gap) / Math.sqrt(1 + (Math.PI / 8) * k * k * variance * scale.forecast);
  return { p: expit(z), gap, sd: Math.sqrt(Math.max(0, variance * scale.report)) };
}
