import assert from 'node:assert/strict';
import { aggregateRaces, scoreRace } from '../research/rane-benchmark-metrics.mjs';
import { benchmarkRatings as raneRatings } from '../research/rane-benchmark.mjs';
import { benchmarkRatings as literatureRatings } from '../research/literature-benchmark.mjs';
import { runPublishedRatings, runSession, carLineage } from '../packages/core/src/state-space/build.js';
import { hybridRatings } from '../packages/core/src/hybrid/ratings.js';

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
// Both benchmarks must use the actual published graph blend, not just its
// underlying hybrid. A controlled teammate result makes the two differ.
const a = { driverId: 'a', constructorId: 'X' },
  b = { driverId: 'b', constructorId: 'X' };
const pair = { x: 'a', y: 'b', cx: 'X', cy: 'X', o: 1, w: 8, same: true, src: 'finish' };
const weekends = [1, 2].map((i) => ({
  info: { raceId: String(i), date: `2024-01-0${i}` },
  year: 2024,
  rows: [a, b],
  raceObs: [pair],
  qualObs: [],
  replayObs: [{ session: 'race', ob: { x: a, y: b, obs: 1, source: 'finish', base: 12 } }],
}));
assert.equal(raneRatings, runPublishedRatings);
assert.equal(literatureRatings, runPublishedRatings);
const actual = runPublishedRatings(weekends, 8);
const qual = runSession(weekends, 'qual', 8);
const race = runSession(weekends, 'race', 8, qual);
const unblended = hybridRatings(weekends, race, qual, carLineage);
assert.notEqual(actual.race.pre[1].rated.get('a'), unblended.pre[1].rated.get('a'), 'benchmark must include graph evidence');
assert.deepEqual(raneRatings(weekends, 8), actual);
assert.deepEqual(literatureRatings(weekends, 8), actual);
console.log('Rane benchmark metrics passed');
