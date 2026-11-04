import { eligibleObjective } from './metrics.mjs';

/** Build a coherent full-field score from pre-decision, retrospective model features. */
export function adjustedProbabilities(roster, parameters) {
  if (!Array.isArray(roster) || !roster.length) throw new Error('A full nonempty roster is required');
  const { formWeight, teammateWeight, headWeight } = parameters;
  if (![formWeight, teammateWeight, headWeight].every(Number.isFinite) || headWeight < 0 || headWeight > 1) {
    throw new Error('Invalid signal weights');
  }
  const values = roster.map((driver) => {
    const { name, baselineProbability, formShift, teammateFormShift, fullHeadStrength } = driver;
    if (typeof name !== 'string' || !name || ![baselineProbability, formShift, teammateFormShift, fullHeadStrength].every(Number.isFinite) || baselineProbability <= 0) {
      throw new Error('Invalid pre-decision signal row');
    }
    return { name, score: (1 - headWeight) * Math.log(baselineProbability) + headWeight * fullHeadStrength +
      formWeight * formShift + teammateWeight * teammateFormShift };
  });
  if (new Set(values.map((row) => row.name)).size !== values.length) throw new Error('Duplicate roster driver');
  const high = Math.max(...values.map((row) => row.score));
  const exp = values.map((row) => Math.exp(row.score - high));
  const total = exp.reduce((sum, value) => sum + value, 0);
  return new Map(values.map((row, i) => [row.name, exp[i] / total]));
}

/** Coordinate ascent on training metrics only; inactive candidates cannot win. */
export function hillClimb(evaluate, dimensions, starts, maxPasses = 4, objectiveName = 'sharpePerRace') {
  const cache = new Map();
  const names = Object.keys(dimensions);
  const evaluateOnce = (candidate) => {
    if (names.some((name) => !dimensions[name].includes(candidate[name]))) throw new Error('Candidate outside search grid');
    const normalized = Object.fromEntries(names.map((name) => [name, candidate[name]]));
    const key = JSON.stringify(normalized);
    if (!cache.has(key)) {
      const metrics = evaluate(normalized);
      cache.set(key, { parameters: normalized, objective: eligibleObjective(metrics, objectiveName), training: metrics });
    }
    return cache.get(key);
  };
  const better = (a, b) => {
    if (a.objective !== null && b.objective === null) return true;
    if (a.objective === null && b.objective !== null) return false;
    if (a.objective !== null) return a.objective > b.objective + 1e-12;
    // Feasibility search uses only training activity, not validation or test data.
    return a.training.tradedRaces > b.training.tradedRaces;
  };
  let global = null;
  for (const seed of starts) {
    let current = evaluateOnce(seed);
    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = false;
      for (const dimension of names) {
        let best = current;
        for (const value of dimensions[dimension]) {
          const trial = evaluateOnce({ ...current.parameters, [dimension]: value });
          if (better(trial, best)) best = trial;
        }
        if (best !== current) { current = best; changed = true; }
      }
      if (!changed) break;
    }
    if (global === null || better(current, global)) global = current;
  }
  return { selected: global?.objective !== null ? global : null, trials: [...cache.values()] };
}

/** Score full-roster winner forecasts after parameter selection, by race. */
export function scoreForecasts(entries, parameters) {
  const rows = entries.map((entry) => {
    const probabilities = adjustedProbabilities(entry.features.roster, parameters);
    const surname = entry.input.resolution.driver.trim().toLowerCase().split(/\s+/).at(-1);
    const matching = [...probabilities.keys()].filter((name) => name.trim().toLowerCase().split(/\s+/).at(-1) === surname);
    if (matching.length > 1) throw new Error('Winner surname is ambiguous in forecast roster');
    const winner = matching[0], winnerProbability = winner ? probabilities.get(winner) : 0;
    let brier = winner ? 0 : 1;
    for (const [name, probability] of probabilities) brier += (probability - (name === winner ? 1 : 0)) ** 2;
    return { race: entry.race, split: entry.split, winnerInRoster: Boolean(winner), winnerProbability,
      logLoss: winnerProbability > 0 ? -Math.log(winnerProbability) : null, multiclassBrier: brier };
  });
  const bySplit = {};
  for (const split of ['training', 'validation', 'pseudo-holdout']) {
    const selected = rows.filter((row) => row.split === split);
    bySplit[split] = selected.length ? { races: selected.length,
      meanMulticlassBrier: selected.reduce((sum, row) => sum + row.multiclassBrier, 0) / selected.length,
      meanLogLoss: selected.every((row) => row.logLoss !== null) ? selected.reduce((sum, row) => sum + row.logLoss, 0) / selected.length : null,
      note: 'Retrospective, uncalibrated roster-normalized winner scores; no Other probability' } : null;
  }
  return { bySplit, races: rows };
}
