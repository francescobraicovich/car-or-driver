// Scoring functions for paired outcomes and complete rankings.
export function probability(gap, scale) {
  if (!Number.isFinite(gap) || !Number.isFinite(scale) || scale <= 0) throw Error('Invalid rating gap or scale');
  return 1 / (1 + 10 ** (-gap / scale));
}

export function scorePairs(rows) {
  if (!rows.length) throw Error('No pairs to score');
  let correct = 0;
  let brier = 0;
  let logLoss = 0;
  for (const { probability: p, outcome } of rows) {
    if (!Number.isFinite(p) || p < 0 || p > 1 || ![0, 1].includes(outcome)) throw Error('Invalid pair prediction');
    correct += p === 0.5 ? 0.5 : Number(p > 0.5 === !!outcome);
    brier += (p - outcome) ** 2;
    logLoss -= Math.log(Math.max(1e-15, outcome ? p : 1 - p));
  }
  return { pairs: rows.length, accuracy: correct / rows.length, brier: brier / rows.length, logLoss: logLoss / rows.length };
}

// Log probability of a full observed order under a Plackett–Luce extension.
export function rankingLogProbability(strengths, scale) {
  if (strengths.length < 2 || !Number.isFinite(scale) || scale <= 0 || strengths.some((v) => !Number.isFinite(v)))
    throw Error('Invalid ranking');
  const logWeights = strengths.map((value) => (Math.LN10 * value) / scale);
  let logProbability = 0;
  for (let i = 0; i < logWeights.length - 1; i++) {
    const remaining = logWeights.slice(i);
    const max = Math.max(...remaining);
    logProbability += logWeights[i] - max - Math.log(remaining.reduce((sum, value) => sum + Math.exp(value - max), 0));
  }
  return logProbability;
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  if (!state) throw Error('Seed must be nonzero');
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) + 0.5) / 4294967296;
  };
}

// Sample the ranking likelihood; these draws do not represent posterior uncertainty.
export function simulateRanking(strengths, scale, random) {
  if (strengths.length < 2 || !Number.isFinite(scale) || scale <= 0 || strengths.some((v) => !Number.isFinite(v)))
    throw Error('Invalid ranking');
  return strengths
    .map((strength, index) => ({ index, utility: (Math.LN10 * strength) / scale - Math.log(-Math.log(random())) }))
    .sort((a, b) => b.utility - a.utility)
    .map((entry) => entry.index);
}

export function eloUpdate(ratings, first, second, outcome) {
  const a = ratings.get(first) ?? 1500;
  const b = ratings.get(second) ?? 1500;
  const adjustment = 24 * (outcome - probability(a - b, 400));
  ratings.set(first, a + adjustment);
  ratings.set(second, b - adjustment);
}

// Resample complete race weekends so their teammate pairs move together.
export function pairedAccuracyInterval(rows, firstModel, secondModel, draws = 5000) {
  if (!rows.length || !Number.isInteger(draws) || draws < 1) throw Error('Invalid bootstrap sample');
  const races = new Map();
  for (const row of rows) {
    if (!races.has(row.raceId)) races.set(row.raceId, []);
    races.get(row.raceId).push(row);
  }
  const groups = [...races.values()];
  const random = seededRandom(20261029);
  const samples = [];
  for (let i = 0; i < draws; i++) {
    let difference = 0;
    let count = 0;
    for (let j = 0; j < groups.length; j++) {
      const group = groups[Math.floor(random() * groups.length)];
      for (const row of group) {
        const accuracy = (p) => (p === 0.5 ? 0.5 : Number(p > 0.5 === !!row.outcome));
        difference += accuracy(row[firstModel]) - accuracy(row[secondModel]);
        count++;
      }
    }
    samples.push(difference / count);
  }
  samples.sort((a, b) => a - b);
  return { races: groups.length, draws, low: samples[Math.floor(0.025 * (draws - 1))], high: samples[Math.floor(0.975 * (draws - 1))] };
}
