import assert from 'node:assert/strict';
import { replayRaceSeries } from '../research/prediction-markets/portfolio/race-series.mjs';

const makeRace = (start, label) => ({
  tradingStart: start,
  raceStart: start + 3100,
  raceEnd: start + 3900,
  settledAt: start + 4000,
  input: {
    race: label,
    firstPractice: start + 3000,
    exitTime: start + 2000,
    resolution: { type: 'winner', driver: 'A' },
    markets: [
      {
        id: 'a',
        driver: 'A',
        initialCompleteSets: 1,
        fairValue: { probability: 0.6, asOf: start, dataThrough: start - 1 },
        coverage: { start, end: start + 2000, complete: true },
      },
    ],
    events: [
      { market: 'a', type: 'snapshot', timestamp: start, bids: [[0.3, 1]], asks: [[0.7, 1]] },
      { market: 'a', type: 'trade', timestamp: start + 1, side: 'sell', price: 0.3, quantity: 6, eventId: 'transaction-leg' },
    ],
  },
});
const a = makeRace(1000, 'First');
const b = makeRace(5000, 'Second');
const common = { latencyMs: 0, inventorySkewTicks: 0, maxBookAgeMs: 10000, tickSize: 0.01, minimumOrderSize: 1 };
const result = replayRaceSeries({ initialCapital: 4, races: [a, b] }, common);
assert.equal(result.races[0].capitalBefore, 4);
assert.ok(Math.abs(result.races[0].capitalAfter - 7.5) < 1e-9);
assert.equal(result.races[1].capitalBefore, result.races[0].capitalAfter);
assert.ok(Math.abs(result.finalCapital - 11) < 1e-9);
const overlap = structuredClone(b);
overlap.tradingStart = 4999;
assert.throws(() => replayRaceSeries({ initialCapital: 4, races: [a, overlap] }), /Overlapping unsettled/);
const early = structuredClone(a);
early.settledAt = early.input.firstPractice - 1;
assert.throws(() => replayRaceSeries({ initialCapital: 4, races: [early] }), /recorded settlement time/);
const beforeRaceEnd = structuredClone(a);
beforeRaceEnd.settledAt = beforeRaceEnd.raceStart;
assert.throws(() => replayRaceSeries({ initialCapital: 4, races: [beforeRaceEnd] }), /recorded settlement time/);
const missingRaceEnd = structuredClone(a);
delete missingRaceEnd.raceEnd;
assert.throws(() => replayRaceSeries({ initialCapital: 4, races: [missingRaceEnd] }), /recorded settlement time/);
const futureEvent = structuredClone(a);
futureEvent.tradingStart++;
assert.throws(() => replayRaceSeries({ initialCapital: 4, races: [futureEvent] }), /valid trading start/);
const override = structuredClone(a);
override.options = { initialCapital: 999 };
assert.throws(() => replayRaceSeries({ initialCapital: 4, races: [override] }), /cannot override/);
const conditional = structuredClone(a);
conditional.input.markets[0].coverage.complete = false;
assert.throws(() => replayRaceSeries({ initialCapital: 4, races: [conditional] }, common), /Verified coverage/);
assert.match(
  replayRaceSeries({ initialCapital: 4, races: [conditional] }, { ...common, allowUnverifiedData: true }).dataClassification,
  /conditional/,
);
console.log('PASS settlement-timed race series');
