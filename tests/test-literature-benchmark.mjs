import assert from 'node:assert/strict';
import {
  eloUpdate,
  pairedAccuracyInterval,
  probability,
  rankingLogProbability,
  scorePairs,
  seededRandom,
  simulateRanking,
} from '../research/literature-metrics.mjs';

assert.equal(probability(0, 75), 0.5);
assert.ok(Math.abs(probability(75, 75) - 10 / 11) < 1e-12);
assert.throws(() => probability(1, 0));
assert.throws(() => probability(NaN, 75));
assert.deepEqual(
  scorePairs([
    { probability: 0.5, outcome: 1 },
    { probability: 0.75, outcome: 1 },
  ]),
  { pairs: 2, accuracy: 0.75, brier: 0.15625, logLoss: -(Math.log(0.5) + Math.log(0.75)) / 2 },
);
assert.throws(() => scorePairs([]));
assert.throws(() => scorePairs([{ probability: 1.1, outcome: 1 }]));
assert.throws(() => scorePairs([{ probability: 0.5, outcome: 2 }]));
assert.ok(Math.abs(rankingLogProbability([0, 0, 0], 75) - Math.log(1 / 6)) < 1e-12);
assert.ok(Math.abs(rankingLogProbability([75, 0], 75) - Math.log(10 / 11)) < 1e-12);
assert.throws(() => rankingLogProbability([0], 75));
const ratings = new Map();
eloUpdate(ratings, 'a', 'b', 1);
assert.equal(ratings.get('a'), 1512);
assert.equal(ratings.get('b'), 1488);
const randomA = seededRandom(9);
const randomB = seededRandom(9);
for (let i = 0; i < 10; i++) assert.deepEqual(simulateRanking([0, 20, 40], 75, randomA), simulateRanking([0, 20, 40], 75, randomB));
const randomC = seededRandom(15);
let wins = 0;
for (let i = 0; i < 10000; i++) wins += Number(simulateRanking([75, 0], 75, randomC)[0] === 0);
assert.ok(Math.abs(wins / 10000 - 10 / 11) < 0.02);
assert.throws(() => seededRandom(0));
assert.throws(() => pairedAccuracyInterval([], 'first', 'second'));
assert.deepEqual(pairedAccuracyInterval([{ raceId: 'r', outcome: 1, first: 0.7, second: 0.3 }], 'first', 'second', 10), {
  races: 1,
  draws: 10,
  low: 1,
  high: 1,
});
console.log('Literature benchmark metrics passed');
