// Walk-forward backtesting.
//
// Every weekend's diag already stores *pre-update* prediction quality
// (log-loss, Brier, accuracy over that weekend's pairwise observations, using
// only ratings learned from earlier weekends). This module aggregates those
// into per-season and overall summaries, with naive (p = 0.5) baselines.
//
// No rebuild is needed: summarizing is O(weekends).
export const NAIVE_LOGLOSS = Math.LN2; // -ln(0.5) ≈ 0.6931

function emptyAcc() {
  return {
    weekends: 0,
    raceObs: 0,
    raceW: 0,
    raceLoss: 0,
    raceBrier: 0,
    raceHits: 0,
    qualObs: 0,
    qualW: 0,
    qualLoss: 0,
    qualBrier: 0,
    qualHits: 0,
    preRaceW: 0,
    preRaceLoss: 0,
    preRaceBrier: 0,
    preRaceHits: 0,
  };
}

function finalize(a) {
  const raceLL = a.raceW ? a.raceLoss / a.raceW : NaN;
  const qualLL = a.qualW ? a.qualLoss / a.qualW : NaN;
  const totW = a.raceW + a.qualW;
  const preRaceLL = a.preRaceW ? a.preRaceLoss / a.preRaceW : NaN;
  // Pre-weekend: Thursday knowledge only — no grid slots, no wet flag.
  // (Qualifying predictions already use pre-weekend ratings only.)
  const preW = a.preRaceW + a.qualW;
  return {
    ...a,
    raceLogLoss: raceLL,
    raceBrier: a.raceW ? a.raceBrier / a.raceW : NaN,
    raceAcc: a.raceW ? a.raceHits / a.raceW : NaN,
    qualLogLoss: qualLL,
    qualBrier: a.qualW ? a.qualBrier / a.qualW : NaN,
    qualAcc: a.qualW ? a.qualHits / a.qualW : NaN,
    // Combined objective used for parameter tuning (weight = observation weight).
    combinedLogLoss: totW ? (a.raceLoss + a.qualLoss) / totW : NaN,
    preCombinedLogLoss: preW ? (a.preRaceLoss + a.qualLoss) / preW : NaN,
    preRaceLogLoss: preRaceLL,
    raceSkill: Number.isFinite(raceLL) ? 1 - raceLL / NAIVE_LOGLOSS : NaN,
    qualSkill: Number.isFinite(qualLL) ? 1 - qualLL / NAIVE_LOGLOSS : NaN,
    totalWeight: totW,
  };
}

/**
 * `diag` picks which per-weekend diagnostics to aggregate: 'diag' is the model's own forecast (ratings, form,
 * grid), 'ssDiag' and 'eloDiag' (state-space model) are the ratings alone, state-space and Elo, on the same observations.
 */
export function summarizeBacktest(model, { burnIn = 20, fromYear = -Infinity, toYear = Infinity, diag = 'diag' } = {}) {
  const perYear = new Map();
  const overall = emptyAcc();
  const snaps = (model?.snaps || []).slice(Math.max(0, burnIn)).filter((s) => s.year >= fromYear && s.year <= toYear && s[diag]);
  for (const s of snaps) {
    const d = s[diag];
    if (!perYear.has(s.year)) perYear.set(s.year, { year: s.year, ...emptyAcc() });
    const y = perYear.get(s.year);
    for (const acc of [y, overall]) {
      acc.weekends++;
      if (Number.isFinite(d.logLoss) && d.weight > 0) {
        acc.raceObs += d.obsCount;
        acc.raceW += d.weight;
        acc.raceLoss += d.logLoss * d.weight;
        acc.raceBrier += d.brier * d.weight;
        acc.raceHits += d.acc * d.weight;
      }
      if (Number.isFinite(d.preLogLoss) && (d.preWeight || 0) > 0) {
        acc.preRaceW += d.preWeight;
        acc.preRaceLoss += d.preLogLoss * d.preWeight;
        acc.preRaceBrier += d.preBrier * d.preWeight;
        acc.preRaceHits += d.preAcc * d.preWeight;
      }
      if (Number.isFinite(d.q?.logLoss) && (d.q.weight || 0) > 0) {
        const qw = d.q.weight;
        acc.qualObs += d.q.obsCount;
        acc.qualW += qw;
        acc.qualLoss += d.q.logLoss * qw;
        acc.qualBrier += d.q.brier * qw;
        acc.qualHits += d.q.acc * qw;
      }
    }
  }
  return {
    burnIn,
    fromYear,
    toYear,
    weekends: snaps.length,
    seasons: [...perYear.values()].sort((a, b) => a.year - b.year).map((a) => ({ year: a.year, ...finalize(a) })),
    overall: finalize(overall),
  };
}

/** Single scalar for tuning: lower is better. */
export function backtestObjective(summary) {
  return summary.overall.combinedLogLoss;
}

/** Pre-weekend (Thursday) scalar: no grid, no wet flag. Lower is better. */
export function preWeekendObjective(summary) {
  return summary.overall.preCombinedLogLoss;
}
