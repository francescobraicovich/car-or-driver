import assert from 'node:assert/strict';
import { replayPortfolio } from '../research/prediction-markets/portfolio/replay.mjs';

const options = {
  initialCapital: 20,
  orderSize: 5,
  minimumOrderSize: 1,
  maxInventory: 10,
  tickSize: 0.01,
  minimumEdgeTicks: 0,
  inventorySkewTicks: 0,
  latencyMs: 0,
  cancelLatencyMs: 0,
  maxBookAgeMs: 20000,
};
const input = {
  race: 'Competitive quotes',
  firstPractice: 11000,
  exitTime: 10000,
  resolution: { type: 'other' },
  markets: [
    {
      id: 'a',
      driver: 'A',
      initialCompleteSets: 5,
      fairValue: { probability: 0.45, asOf: 1000, dataThrough: 900 },
      coverage: { complete: true, start: 1000, end: 10000 },
    },
  ],
  events: [
    { market: 'a', type: 'snapshot', timestamp: 1000, bids: [[0.4, 10]], asks: [[0.5, 10]] },
    { market: 'a', type: 'trade', timestamp: 1100, side: 'sell', price: 0.41, quantity: 5, eventId: 'bid' },
    { market: 'a', type: 'trade', timestamp: 1200, side: 'buy', price: 0.49, quantity: 5, eventId: 'ask' },
  ],
};

assert.deepEqual(replayPortfolio(input, options), replayPortfolio(input, { ...options, quoteImprovementTicks: 0 }));
assert.equal(replayPortfolio(input, options).fills.length, 0);
const competitive = replayPortfolio(input, { ...options, quoteImprovementTicks: 1 });
assert.deepEqual(
  competitive.fills.map(({ side, price, quantity }) => [side, Math.round(price * 100), quantity]),
  [
    ['buy', 41, 5],
    ['sell', 49, 5],
  ],
  'competitive orders fill only when eligible prints arrive',
);
assert.ok(Math.abs(competitive.profit - 0.4) < 1e-8);
assert.ok(Math.abs(competitive.peakCapitalCommitted - 7.05) < 1e-8, 'initial sets and reserved bid count toward capital');

const locked = structuredClone(input);
locked.markets[0].fairValue.probability = 0.41;
locked.events = [
  { ...input.events[0], asks: [[0.42, 10]] },
  { market: 'a', type: 'trade', timestamp: 1100, side: 'buy', price: 0.41, quantity: 5, eventId: 'one' },
  { market: 'a', type: 'trade', timestamp: 1200, side: 'sell', price: 0.41, quantity: 5, eventId: 'two' },
];
assert.deepEqual(
  replayPortfolio(locked, { ...options, quoteImprovementTicks: 1 }).fills.map((f) => f.side),
  ['buy'],
  'opposing orders do not lock at the same price',
);

const queued = structuredClone(input);
queued.markets[0].fairValue.probability = 0.4;
queued.events = [
  { ...input.events[0], bids: [[0.4, 3]] },
  { market: 'a', type: 'trade', timestamp: 1100, side: 'sell', price: 0.4, quantity: 5, eventId: 'queue' },
];
assert.equal(
  replayPortfolio(queued, { ...options, quoteImprovementTicks: 1 }).fills[0].quantity,
  2,
  'fair-value limits can join an existing level behind visible queue',
);

const arriving = structuredClone(input);
arriving.events = [
  input.events[0],
  { market: 'a', type: 'update', timestamp: 1100, side: 'sell', price: 0.5, quantity: 0 },
  { market: 'a', type: 'update', timestamp: 1200, side: 'sell', price: 0.41, quantity: 10 },
  { market: 'a', type: 'trade', timestamp: 2100, side: 'sell', price: 0.41, quantity: 10, eventId: 'arrival' },
];
assert.equal(
  replayPortfolio(arriving, { ...options, quoteImprovementTicks: 1, latencyMs: 1000, cancelLatencyMs: 1000 }).fills.length,
  0,
  'post-only order is rejected if the external book crosses before arrival',
);

const canceling = structuredClone(input);
canceling.events = [
  input.events[0],
  { market: 'a', type: 'update', timestamp: 1100, side: 'sell', price: 0.5, quantity: 0 },
  { market: 'a', type: 'update', timestamp: 1101, side: 'sell', price: 0.51, quantity: 10 },
  { market: 'a', type: 'trade', timestamp: 1200, side: 'buy', price: 0.49, quantity: 5, eventId: 'canceling' },
];
assert.equal(
  replayPortfolio(canceling, { ...options, quoteImprovementTicks: 1, cancelLatencyMs: 1000 }).fills[0].quantity,
  5,
  'improved order remains executable during cancellation',
);

const through = structuredClone(input);
through.events = [
  {
    ...input.events[0],
    bids: [
      [0.4, 10],
      [0.39, 10],
    ],
  },
  { market: 'a', type: 'trade', timestamp: 1100, side: 'sell', price: 0.4, quantity: 3, eventId: 'through' },
];
assert.equal(replayPortfolio(through, { ...options, quoteImprovementTicks: 1 }).fills.length, 0);
const inferred = replayPortfolio(through, { ...options, quoteImprovementTicks: 1, tradeThroughFills: true });
assert.equal(inferred.fills[0].quantity, 3, 'inferred fill is capped by observed trade quantity');
assert.equal(inferred.fills[0].tradeThrough, true);
const delayedPrints = structuredClone(through);
delayedPrints.events = [
  through.events[0],
  { ...through.events[1], timestamp: 2100, sourceTimestamp: 1999, eventId: 'before-activation' },
  { ...through.events[1], timestamp: 2200, sourceTimestamp: 2200, eventId: 'first' },
  { ...through.events[1], timestamp: 2300, sourceTimestamp: 2300, eventId: 'second' },
  { ...through.events[1], timestamp: 2400, sourceTimestamp: 2400, eventId: 'third' },
];
const delayed = replayPortfolio(delayedPrints, { ...options, quoteImprovementTicks: 1, tradeThroughFills: true, latencyMs: 1000 });
assert.equal(delayed.preactivationTradeEvents, 1, 'late-arriving preactivation print cannot fill');
assert.deepEqual(
  delayed.fills.map((fill) => fill.quantity),
  [3, 2],
  'a filled order cannot consume subsequent prints without an intervening book update',
);

const liquidated = replayPortfolio(through, {
  ...options,
  quoteImprovementTicks: 1,
  tradeThroughFills: true,
  exitMode: 'liquidation',
  takerFeeRate: 0.02,
});
assert.equal(liquidated.complete, true);
assert.equal(liquidated.fills[1].displayedPrice, 0.39);
assert.ok(Math.abs(liquidated.fills[1].slippageCost - 0.03) < 1e-8);
assert.ok(liquidated.fees > 0);
const insufficient = structuredClone(through);
insufficient.events[0].bids = [[0.4, 1]];
assert.equal(
  replayPortfolio(insufficient, {
    ...options,
    quoteImprovementTicks: 1,
    tradeThroughFills: true,
    exitMode: 'liquidation',
    takerFeeRate: 0.02,
  }).profit,
  null,
  'incomplete liquidation has no reported profit',
);
assert.throws(() => replayPortfolio(input, { ...options, quoteImprovementTicks: 0.5 }), /execution options/);
assert.throws(() => replayPortfolio(input, { ...options, quoteImprovementTicks: -1 }), /quoteImprovementTicks/);
assert.throws(() => replayPortfolio(input, { ...options, tradeThroughFills: 1 }), /execution options/);
const midpointInput = structuredClone(input);
midpointInput.markets[0].fairValue.probability = 0.1;
assert.deepEqual(
  replayPortfolio(midpointInput, { ...options, quoteImprovementTicks: 1 }),
  replayPortfolio(midpointInput, { ...options, quoteImprovementTicks: 1, marketMidpointWeight: 0 }),
  'zero market weight preserves model-only pricing',
);
assert.equal(
  replayPortfolio(midpointInput, { ...options, quoteImprovementTicks: 1 }).fills.length,
  1,
  'model-only pricing does not bid near a much higher market midpoint',
);
assert.deepEqual(
  replayPortfolio(midpointInput, { ...options, quoteImprovementTicks: 1, marketMidpointWeight: 1 }).fills.map((fill) => fill.side),
  ['buy', 'sell'],
  'a current-market anchor may quote both sides',
);
midpointInput.events = [
  input.events[0],
  { market: 'a', type: 'update', timestamp: 1100, side: 'buy', price: 0.44, quantity: 10 },
  { market: 'a', type: 'trade', timestamp: 1200, side: 'sell', price: 0.45, quantity: 5, eventId: 'updated-midpoint' },
];
assert.equal(
  replayPortfolio(midpointInput, { ...options, quoteImprovementTicks: 1, marketMidpointWeight: 1 }).fills[0].price,
  0.45,
  'the anchor updates only after the corresponding observed book update',
);
assert.throws(() => replayPortfolio(input, { ...options, marketMidpointWeight: -0.1 }), /marketMidpointWeight/);
assert.throws(() => replayPortfolio(input, { ...options, marketMidpointWeight: 1.1 }), /marketMidpointWeight/);

const movingBook = structuredClone(input);
movingBook.events = [
  input.events[0],
  { market: 'a', type: 'trade', timestamp: 1050, side: 'sell', price: 0.4, quantity: 15, eventId: 'old-bid' },
  { market: 'a', type: 'snapshot', timestamp: 1100, bids: [[0.55, 10]], asks: [[0.6, 10]] },
  { market: 'a', type: 'trade', timestamp: 1200, side: 'sell', price: 0.55, quantity: 5, eventId: 'new-bid' },
];
assert.deepEqual(
  replayPortfolio(movingBook, { ...options, marketMidpointWeight: 1, cancelLatencyMs: 1000 }).fills.map((fill) => fill.eventId),
  ['old-bid'],
  'a new quote cannot cross the opposing order still awaiting cancellation',
);

const windowed = structuredClone(through);
windowed.events = [
  through.events[0],
  through.events[1],
  { market: 'a', type: 'snapshot', timestamp: 5000, bids: [[0.39, 1]], asks: [[0.5, 10]] },
  { market: 'a', type: 'snapshot', timestamp: 6000, bids: [[0.39, 1]], asks: [[0.5, 10]] },
  { market: 'a', type: 'update', timestamp: 6100, side: 'buy', price: 0.39, quantity: 2 },
];
const windowOptions = {
  ...options,
  quoteImprovementTicks: 1,
  tradeThroughFills: true,
  cancelLatencyMs: 1000,
  maxBookAgeMs: 4000,
  exitMode: 'liquidation',
  liquidationStartTime: 5000,
  takerFeeRate: 0.02,
};
const closedEarly = replayPortfolio(windowed, windowOptions);
assert.equal(closedEarly.complete, true);
assert.deepEqual(
  closedEarly.fills.filter((fill) => fill.kind === 'liquidation').map((fill) => [fill.timestamp, fill.quantity]),
  [
    [6000, 1],
    [6100, 2],
  ],
  'cancel first, then close against each freshly recorded depth',
);
assert.ok(closedEarly.fees > 0);
const noRefresh = structuredClone(windowed);
noRefresh.events[4] = { market: 'a', type: 'update', timestamp: 6100, side: 'sell', price: 0.5, quantity: 11 };
assert.equal(
  replayPortfolio(noRefresh, windowOptions).profit,
  null,
  'partial liquidation cannot reuse the same historical level after an unrelated update',
);
assert.throws(() => replayPortfolio(input, { ...options, liquidationStartTime: 5000 }), /liquidationStartTime/);
assert.throws(() => replayPortfolio(input, { ...windowOptions, liquidationStartTime: 10000 }), /liquidationStartTime/);
console.log('PASS competitive quotes, queue priority, capital and liquidation');
