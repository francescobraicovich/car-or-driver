// Per-weekend ratings-alone diagnostics, in the shape backtest.js reads: log-loss, Brier and accuracy of a rating system's forecast of
// the exam's observations, accumulated pair by pair.
export const logit = (p) => Math.log(Math.min(1 - 1e-12, Math.max(1e-12, p)) / (1 - Math.min(1 - 1e-12, Math.max(1e-12, p))));
const nll = (z, o) => -Math.log(Math.min(1 - 1e-12, Math.max(1e-12, 1 / (1 + Math.exp(-(o ? z : -z))))));

/** A per-weekend diagnostic in the shape backtest.js reads: ratings alone, so "pre" equals the race forecast. */
export function emptyDiag() {
  return { obsCount: 0, weight: 0, loss: 0, brier: 0, hits: 0 };
}
export function addDiag(a, z, o, w) {
  const p = 1 / (1 + Math.exp(-z));
  a.obsCount++;
  a.weight += w;
  a.loss += w * nll(z, o);
  a.brier += w * (o - p) ** 2;
  a.hits += w * +(p > 0.5 === !!o);
}
export function finishDiag(race, qual) {
  const r = (a, key) => (a.weight ? a[key] / a.weight : NaN);
  const raceShape = {
    obsCount: race.obsCount,
    weight: race.weight,
    logLoss: r(race, 'loss'),
    brier: r(race, 'brier'),
    acc: r(race, 'hits'),
    preWeight: race.weight,
    preLogLoss: r(race, 'loss'),
    preBrier: r(race, 'brier'),
    preAcc: r(race, 'hits'),
  };
  return {
    ...raceShape,
    q: { obsCount: qual.obsCount, weight: qual.weight, logLoss: r(qual, 'loss'), brier: r(qual, 'brier'), acc: r(qual, 'hits') },
  };
}
