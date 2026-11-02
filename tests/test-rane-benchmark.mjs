import assert from 'node:assert/strict';
import { aggregateRaces, scoreRace } from '../research/benchmarks/rane-benchmark-metrics.mjs';

const ordered = [
  { strength: 3, position: 1 },
  { strength: 2, position: 2 },
  { strength: 1, position: 4 },
];
assert.deepEqual(scoreRace(ordered), { entrants: 3, kendallTau: 1, meanAbsoluteError: 0 });
assert.deepEqual(scoreRace(ordered.map((entry) => ({ ...entry, strength: -entry.strength }))), {
  entrants: 3,
  kendallTau: -1,
  meanAbsoluteError: 4 / 3,
});
assert.deepEqual(
  scoreRace([
    { strength: 2, position: 1 },
    { strength: 2, position: 2 },
    { strength: 1, position: 3 },
  ]),
  { entrants: 3, kendallTau: 2 / 3, meanAbsoluteError: 1 / 3 },
);
assert.throws(() => scoreRace([{ strength: 1, position: 1 }]));
assert.throws(() =>
  scoreRace([
    { strength: NaN, position: 1 },
    { strength: 2, position: 2 },
  ]),
);
assert.throws(() =>
  scoreRace([
    { strength: 1, position: 1 },
    { strength: 2, position: 1 },
  ]),
);
assert.deepEqual(
  aggregateRaces([
    { entrants: 2, kendallTau: 1, meanAbsoluteError: 0 },
    { entrants: 4, kendallTau: 0, meanAbsoluteError: 3 },
  ]),
  { races: 2, entrants: 6, kendallTau: 0.5, meanAbsoluteError: 2, meanRaceAbsoluteError: 1.5 },
);
assert.throws(() => aggregateRaces([]));
console.log('Rane benchmark metrics passed');
