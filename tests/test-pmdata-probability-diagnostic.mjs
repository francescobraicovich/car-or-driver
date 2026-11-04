import assert from 'node:assert/strict';
import { binaryScore, scoreByRace, firstMidpoint, inactiveReason } from '../research/prediction-markets/pmdata/probability-diagnostic.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
close(binaryScore(0.25, 1).brier, 0.5625);
close(binaryScore(0.25, 1).logLoss, -Math.log(0.25));
close(binaryScore(0.25, 0).logLoss, -Math.log(0.75));
for (const invalid of [-1, 0, 1, NaN, Infinity, null]) assert.throws(() => binaryScore(invalid, 0), /probability/);
assert.throws(() => binaryScore(0.5, 0.5), /binary outcome/);
const inactive = {
  inactiveMarkets: [
    { slug: 'f1-race-winner-leclerc-2026', reason: 'Explicit data-quality exclusion' },
    { slug: 'f1-race-winner-hamilton-2026', reason: 'No initial book in the trading window' },
  ],
};
assert.equal(inactiveReason(inactive, 'Charles Leclerc'), 'Inactive market: Explicit data-quality exclusion');
assert.equal(inactiveReason(inactive, 'Lewis Hamilton'), 'Inactive market: No initial book in the trading window');
assert.throws(() => inactiveReason(inactive, 'Lando Norris'), /Ambiguous inactive market/);

const row = (race, driver, probability) => ({
  race,
  driver,
  split: 'training',
  outcome: 0,
  baseline: probability,
  selected: probability,
  firstBookMidpoint: probability,
});
const result = scoreByRace([row('first', 'one', 0.9), row('second', 'one', 0.1), row('second', 'two', 0.1), row('second', 'three', 0.1)]);
assert.equal(result.splits.training.races, 2);
assert.equal(result.splits.training.markets, 4);
close(result.splits.training.scores.baseline.brier, (0.81 + 0.01) / 2);
assert.equal(result.splits.validation, null);
assert.throws(() => scoreByRace([row('first', 'one', 0.1), row('first', 'one', 0.2)]), /Duplicate driver/);

const start = '2026-06-25T14:00:00.000Z',
  at = '2026-06-25T14:00:01.000Z',
  end = '2026-06-25T16:00:00.000Z';
const time = Date.parse(at),
  market = { conditionId: 'condition', clobTokenIds: ['yes', 'no'] };
const book = {
  condition: 'condition',
  asset: 'yes',
  type: 'book',
  received: time,
  source: time - 1,
  bids: JSON.stringify([
    [0.12, 10],
    [0.13, 4],
  ]),
  asks: JSON.stringify([
    [0.17, 10],
    [0.16, 4],
  ]),
};
const resultBook = firstMidpoint({ rows: [book] }, market, at, start, end);
close(resultBook.midpoint, 0.145);
assert.equal(resultBook.bid, 0.13);
assert.equal(resultBook.ask, 0.16);
assert.throws(() => firstMidpoint({ rows: [{ ...book, asks: '[]' }] }, market, at, start, end), /one-sided/);
assert.throws(() => firstMidpoint({ rows: [{ ...book, asks: '[[0.12,1]]' }] }, market, at, start, end), /crossed/);
assert.throws(() => firstMidpoint({ rows: [book] }, market, start, start, end), /does not match/);
assert.throws(() => firstMidpoint({ rows: [{ ...book, source: time + 1 }] }, market, at, start, end), /source timestamp/);
assert.throws(() => firstMidpoint({ rows: [book] }, market, at, '2026-06-25T14:01:00.000Z', end), /outside/);
console.log('PASS race-weighted probability diagnostics and as-of first-book midpoint');
