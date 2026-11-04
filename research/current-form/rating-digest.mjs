import { createHash } from 'node:crypto';
const entries = (map) => [...map];
export function ratingValues(runs) {
  return Object.fromEntries(['race', 'qual'].map((session) => {
    const run = runs[session];
    return [session, {
      pre: run.pre.map(({ rated, drivers, cars }) => [entries(rated), entries(drivers), entries(cars)]),
      post: run.ratings.map(({ drivers, cars }) => [entries(drivers), entries(cars)]),
      predictions: run.predictions.map(({ mean, vari }) => [[...mean], [...vari]]),
      latest: run.latest ? { mean: [...run.latest.mean], cov: run.latest.cov } : null,
    }];
  }));
}

export function ratingDigest(runs) {
  return createHash('sha256').update(JSON.stringify(ratingValues(runs))).digest('hex');
}
