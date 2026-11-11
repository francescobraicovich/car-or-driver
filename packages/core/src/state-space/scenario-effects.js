// Per-driver scenario effects learned from the published ratings' pre-weekend residuals.
import { MODEL_SETTINGS } from '../presets/model-settings.js';
import { STATE_SPACE_FIT } from '../presets/state-space-fit.js';

export const SCENARIO_EFFECTS = { circuitRate: 5, winterCarry: 0.7, wetRate: 0 };

export function scenarioEffects(
  weekends,
  race,
  snapshots,
  {
    circuitRate = SCENARIO_EFFECTS.circuitRate,
    winterCarry = SCENARIO_EFFECTS.winterCarry,
    wetRate = SCENARIO_EFFECTS.wetRate,
    observe = null,
  } = {},
) {
  const circuits = new Map();
  const wet = new Map();
  const scale = Math.LN10 / MODEL_SETTINGS.scale;
  let previousYear = null;
  for (const [index, weekend] of weekends.entries()) {
    if (previousYear !== null && weekend.year !== previousYear) {
      for (const offsets of circuits.values()) for (const [circuit, value] of offsets) offsets.set(circuit, value * winterCarry);
    }
    previousYear = weekend.year;
    const circuit = weekend.info.circuitId;
    const wetRace = !!snapshots[index].diag.wet;
    const levels = race.pre[index];
    const totals = new Map();
    const weights = new Map();
    for (const observation of weekend.raceObs) {
      const { x, y, cx, cy, o, w, same } = observation;
      const base = levels.rated.get(x) - levels.rated.get(y) + levels.cars.get(cx) - levels.cars.get(cy);
      if (!Number.isFinite(base)) continue;
      const circuitGap = (circuits.get(x)?.get(circuit) ?? 0) - (circuits.get(y)?.get(circuit) ?? 0);
      const wetGap = (wet.get(x) ?? 0) - (wet.get(y) ?? 0);
      const multiplier =
        (same ? STATE_SPACE_FIT.scenario.teammates : STATE_SPACE_FIT.scenario.cars) * (wetRace ? STATE_SPACE_FIT.scenario.wetRatio : 1);
      const probability = 1 / (1 + Math.exp(-scale * multiplier * (base + circuitGap + (wetRace ? wetGap : 0))));
      observe?.({ weekend, observation, base, circuitGap, wetGap, wetRace, multiplier, probability });
      const residual = w * (o - probability);
      for (const [id, signed] of [
        [x, residual],
        [y, -residual],
      ]) {
        totals.set(id, (totals.get(id) ?? 0) + signed);
        weights.set(id, (weights.get(id) ?? 0) + w);
      }
    }
    for (const [id, total] of totals) {
      const residual = total / weights.get(id);
      const offsets = circuits.get(id) ?? new Map();
      offsets.set(circuit, (offsets.get(circuit) ?? 0) + circuitRate * residual);
      circuits.set(id, offsets);
      if (wetRace) wet.set(id, (wet.get(id) ?? 0) + wetRate * residual);
    }
  }
  return { affFinal: circuits, wetFinal: wet };
}
