import assert from 'node:assert/strict';
import { replayPortfolio } from '../research/prediction-markets/portfolio/replay.mjs';

const market = (id, driver, probability, initialCompleteSets = 5, end = 10000) => ({
  id,
  driver,
  initialCompleteSets,
  fairValue: { probability, asOf: 1000, dataThrough: 900 },
  coverage: { complete: true, start: 1000, end },
});
const options = {
  initialCapital: 100,
  orderSize: 5,
  minimumOrderSize: 1,
  maxInventory: 10,
  tickSize: 0.01,
  latencyMs: 0,
  maxBookAgeMs: 20000,
  inventorySkewTicks: 0,
};
const input = {
  race: 'Cancellation example',
  firstPractice: 11000,
  exitTime: 10000,
  resolution: { type: 'other' },
  markets: [market('a', 'A', 0.1)],
  events: [
    { market: 'a', type: 'snapshot', timestamp: 1000, bids: [[0.1, 1]], asks: [[0.22, 1]] },
    { market: 'a', type: 'update', timestamp: 1100, side: 'sell', price: 0.22, quantity: 0 },
    { market: 'a', type: 'update', timestamp: 1101, side: 'sell', price: 0.23, quantity: 10 },
    { market: 'a', type: 'trade', timestamp: 1120, side: 'buy', price: 0.22, quantity: 6, eventId: 'before-cancel' },
  ],
};
assert.equal(replayPortfolio(input, options).fills.length, 0, 'the legacy immediate cancellation loses the prior quote');
const delayed = replayPortfolio(input, { ...options, cancelLatencyMs: 1000 });
assert.deepEqual(
  delayed.fills.map(({ side, price, quantity }) => ({ side, price, quantity })),
  [{ side: 'sell', price: 0.22, quantity: 5 }],
  'a quote remains exposed until the cancellation arrives',
);

const afterCancellation = structuredClone(input);
afterCancellation.events[3].timestamp = 2200;
assert.equal(
  replayPortfolio(afterCancellation, { ...options, cancelLatencyMs: 1000 }).fills.length,
  0,
  'a print after the cancellation cannot fill the canceled order',
);

const pending = structuredClone(input);
pending.events[3].timestamp = 1550;
assert.equal(
  replayPortfolio(pending, { ...options, latencyMs: 500, cancelLatencyMs: 1000 }).fills.length,
  1,
  'a canceled order still in flight can activate and fill before its cancellation',
);

const reserved = {
  race: 'Shared funds',
  firstPractice: 11000,
  exitTime: 10000,
  resolution: { type: 'other' },
  markets: [market('a', 'A', 0.5, 0), market('b', 'B', 0.5, 0)],
  events: [
    {
      market: 'a',
      type: 'snapshot',
      timestamp: 1000,
      bids: [
        [0.2, 1],
        [0.1, 1],
      ],
      asks: [[0.9, 1]],
    },
    { market: 'a', type: 'update', timestamp: 1100, side: 'buy', price: 0.2, quantity: 0 },
    { market: 'b', type: 'snapshot', timestamp: 1200, bids: [[0.2, 1]], asks: [[0.9, 1]] },
    { market: 'b', type: 'trade', timestamp: 1300, side: 'sell', price: 0.2, quantity: 10, eventId: 'b' },
    { market: 'a', type: 'trade', timestamp: 1400, side: 'sell', price: 0.2, quantity: 10, eventId: 'a' },
  ],
};
const shared = replayPortfolio(reserved, { ...options, initialCapital: 1, cancelLatencyMs: 1000 });
assert.deepEqual(
  shared.fills.map((fill) => fill.market),
  ['a'],
  'cash reserved by a canceling quote remains unavailable to another market',
);

const exit = structuredClone(input);
exit.exitTime = 3000;
exit.markets[0].coverage.end = 3000;
exit.events = [
  exit.events[0],
  { market: 'a', type: 'trade', timestamp: 2500, side: 'buy', price: 0.22, quantity: 2, eventId: 'during-exit-cancel' },
  { market: 'a', type: 'trade', timestamp: 3000, side: 'buy', price: 0.22, quantity: 10, eventId: 'at-exit' },
];
const exiting = replayPortfolio(exit, { ...options, cancelLatencyMs: 1000 });
assert.equal(exiting.fills.length, 1, 'the quote stays live during exit cancellation but is removed at exit');
assert.equal(exiting.fills[0].quantity, 1);
const stale = structuredClone(input);
stale.events = [
  stale.events[0],
  { market: 'a', type: 'trade', timestamp: 2500, side: 'buy', price: 0.22, quantity: 6, eventId: 'stale-cancel' },
];
assert.equal(
  replayPortfolio(stale, { ...options, maxBookAgeMs: 1000, cancelLatencyMs: 1000 }).fills.length,
  1,
  'a quote can fill while stale-book cancellation is still in flight',
);
const stalePending = structuredClone(stale);
stalePending.events[1].timestamp = 2600;
assert.equal(
  replayPortfolio(stalePending, { ...options, latencyMs: 1500, maxBookAgeMs: 1000, cancelLatencyMs: 1000 }).fills.length,
  1,
  'a sent order can arrive and fill while its stale-book cancellation is still in flight',
);
const crossed = structuredClone(input);
crossed.events = [
  crossed.events[0],
  { market: 'a', type: 'update', timestamp: 1100, side: 'buy', price: 0.3, quantity: 1 },
  { market: 'a', type: 'trade', timestamp: 1120, side: 'buy', price: 0.22, quantity: 6, eventId: 'crossed-cancel' },
];
assert.equal(
  replayPortfolio(crossed, { ...options, cancelLatencyMs: 1000, allowUnverifiedData: true }).fills.length,
  1,
  'a quote can fill while crossed-book cancellation is in flight',
);
assert.throws(() => replayPortfolio(input, { ...options, cancelLatencyMs: -1 }), /cancelLatencyMs/);
console.log('PASS delayed cancellation, collateral reservation and exit timing');
