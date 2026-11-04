import assert from 'node:assert/strict';
import { replayMarket } from '../research/prediction-markets/backtest/replay.mjs';

const snapshot = { type: 'snapshot', timestamp: 1000, bids: [[0.4, 2]], asks: [[0.6, 2]] };
const base = {
  pair: { driverA: 'Driver A', driverB: 'Driver B' },
  firstPractice: 10000,
  exitTime: 9000,
  exitMode: 'settlement',
  settlement: 0.5,
  coverage: { start: 1000, end: 9000, complete: true },
  events: [snapshot],
};
const settings = { latencyMs: 0, inventorySkewTicks: 0, maxBookAgeMs: 10000 };
const run = (events, extra = {}, config = {}) => replayMarket({ ...base, events, ...extra }, { ...settings, ...config });
const trade = (timestamp, side, quantity, price = side === 'sell' ? 0.4 : 0.6) => ({ type: 'trade', timestamp, side, price, quantity });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

assert.equal(run([snapshot, trade(2000, 'sell', 2)]).fills.length, 0, 'displayed queue must be consumed first');
const held = run([snapshot, trade(2000, 'sell', 3)]);
assert.equal(held.fills[0].quantity, 1);
near(held.profit, 0.1);
near(held.settlementCash, 0.5);
near(run([snapshot, trade(2000, 'sell', 3)], { settlement: 0 }).profit, -0.4);
near(run([snapshot, trade(2000, 'sell', 3)], { settlement: 1 }).profit, 0.6);
const roundTrip = run([snapshot, trade(2000, 'sell', 3), trade(3000, 'buy', 3)]);
near(roundTrip.profit, 0.2);
assert.equal(roundTrip.inventory, 0);
const fees = run([snapshot, trade(2000, 'sell', 3), trade(3000, 'buy', 3)], {}, { makerFeeRate: 0.01 });
near(fees.fees, 0.01);
near(fees.profit, 0.19);
const update = { type: 'update', timestamp: 1500, side: 'buy', price: 0.4, quantity: 0 };
assert.equal(run([snapshot, update, trade(2000, 'sell', 2)]).fills.length, 0, 'a depth reduction must not itself advance the queue');
const clipped = run([snapshot, trade(2000, 'sell', 100)], {}, { maxInventory: 3 });
assert.equal(clipped.inventory, 3, 'inventory cannot exceed the configured limit');
const oppositeUpdate = { type: 'update', timestamp: 2500, side: 'sell', price: 0.6, quantity: 3 };
assert.equal(
  run([snapshot, trade(2000, 'sell', 7), oppositeUpdate, trade(3000, 'sell', 7)]).fills.length,
  1,
  'an unrelated update must not replenish a filled bid',
);
assert.equal(run([snapshot, trade(2000, 'sell', 3)], {}, { initialCash: 0 }).fills.length, 0, 'cash is required to place a bid');
assert.equal(
  run([snapshot, trade(2000, 'buy', 3)], {}, { initialCompleteSets: 0 }).fills.length,
  0,
  'YES tokens are required to place an ask',
);
near(run([snapshot, trade(2000, 'sell', 3)], {}, { initialCash: 0.2 }).fills[0].quantity, 0.5);
near(run([snapshot, trade(2000, 'buy', 3)], {}, { initialCompleteSets: 0.25 }).fills[0].quantity, 0.25);
const refreshedBid = { type: 'update', timestamp: 3000, side: 'buy', price: 0.4, quantity: 2 };
const exit = run(
  [snapshot, trade(2000, 'sell', 3), refreshedBid],
  { exitMode: 'liquidation' },
  { liquidationSlippageTicks: 1, takerFeeRate: 0.01 },
);
assert.equal(exit.complete, true);
near(exit.profit, -0.0139);
assert.equal(exit.inventory, 0);
const polymarket = run(
  [snapshot, trade(2000, 'sell', 3), refreshedBid],
  { exitMode: 'liquidation' },
  { feeMode: 'polymarket', takerFeeRate: 0.05 },
);
near(polymarket.fills[0].fee, 0);
near(polymarket.fills[1].fee, 0.05 * 0.39 * 0.61);
near(polymarket.profit, -0.01 - 0.05 * 0.39 * 0.61);
const refreshedAsk = { type: 'update', timestamp: 3000, side: 'sell', price: 0.6, quantity: 2 };
const cashLimited = run(
  [snapshot, trade(2000, 'buy', 3), refreshedAsk],
  { exitMode: 'liquidation' },
  { feeMode: 'polymarket', takerFeeRate: 0.05, initialCash: 0 },
);
assert.equal(cashLimited.complete, false);
near(cashLimited.fills[1].quantity, 0.6 / (0.61 + 0.05 * 0.61 * 0.39));
near(cashLimited.cashBalanceBeforeSettlement, 0);
assert.throws(() => run([snapshot], {}, { feeMode: 'polymarket' }), /explicit historical/);
assert.throws(() => run([snapshot], {}, { feeMode: 'polymarket', takerFeeRate: 0.05, makerFeeRate: 0.01 }), /zero maker fee/);
const thin = { ...snapshot, bids: [[0.4, 0.1]] };
const incomplete = run([thin, trade(2000, 'sell', 2.1), { ...refreshedBid, quantity: 0.1 }], { exitMode: 'liquidation' });
assert.equal(incomplete.complete, false);
assert.equal(incomplete.profit, null);
const uncertain = run([snapshot, trade(2000, 'sell', 3)], { exitMode: 'liquidation' });
assert.equal(uncertain.complete, false, 'liquidation cannot reuse unrefreshed depth at a trade price');
const stale = run([snapshot, trade(2000, 'sell', 3)], { exitMode: 'liquidation' }, { maxBookAgeMs: 1500 });
assert.equal(stale.complete, false);
assert.equal(run([snapshot, trade(10000, 'sell', 100)]).fills.length, 0, 'events at FP1 are excluded');
assert.equal(run([snapshot, trade(2000, 'sell', 3)], {}, { latencyMs: 1500 }).fills.length, 0, 'latency delays entry');
assert.throws(() => run([snapshot], { exitTime: 10000 }), /precede first practice/);
assert.throws(() => run([snapshot], { settlement: 0.7 }), /Settlement/);
assert.throws(() => run([snapshot, { type: 'gap', timestamp: 2000 }]), /gap/);
assert.throws(() => run([snapshot], { coverage: { start: 1000, end: 9000, complete: false } }), /coverage/);
assert.throws(() => run([{ type: 'update', timestamp: 1000, side: 'buy', price: 0.4, quantity: 2 }]), /snapshot/);
assert.throws(() => run([snapshot, trade(999, 'sell', 2)]), /nondecreasing/);
assert.throws(() => run([{ ...snapshot, sourceTimestamp: 500 }], {}, { maxSourceAgeMs: 100 }), /too old/);
assert.throws(() => run([{ ...snapshot, sourceTimestamp: 1001 }]), /Source timestamp/);
assert.throws(
  () =>
    run([
      { ...snapshot, sourceTimestamp: 1000 },
      { ...trade(2000, 'sell', 2), sourceTimestamp: 999 },
    ]),
  /out of order/,
);
const winner = {
  instrument: { type: 'race-winner', driver: 'Driver A', race: 'Example Grand Prix' },
  fairValue: { probability: 0.6, asOf: 1000 },
};
const fairBid = run([snapshot, trade(2000, 'sell', 3), trade(3000, 'buy', 3)], winner, { minimumEdgeTicks: 10 });
assert.equal(fairBid.fills.length, 1, 'a fair-value limit keeps the offer above model value');
assert.equal(fairBid.fills[0].side, 'buy');
const fairAsk = run(
  [snapshot, trade(2000, 'sell', 3), trade(3000, 'buy', 3)],
  { ...winner, fairValue: { probability: 0.4, asOf: 1000 } },
  { minimumEdgeTicks: 10 },
);
assert.equal(fairAsk.fills.length, 1, 'a fair-value limit keeps the bid below model value');
assert.equal(fairAsk.fills[0].side, 'sell');
const dated = run(
  [snapshot, trade(2000, 'sell', 3), { ...snapshot, timestamp: 2500 }, trade(3000, 'sell', 3)],
  { ...winner, fairValue: { probability: 0.6, asOf: 2500 } },
  { minimumEdgeTicks: 10 },
);
assert.equal(dated.fills.length, 1);
assert.equal(dated.fills[0].timestamp, 3000, 'a forecast cannot affect orders before it exists');
assert.throws(() => run([snapshot], { ...winner, fairValue: undefined }), /dated fair value/);
assert.throws(() => run([snapshot], { ...winner, fairValue: { probability: 1.1, asOf: 1000 } }), /fair value probability/);
assert.throws(() => run([snapshot], { ...winner, fairValue: { probability: 0.5, asOf: 9001 } }), /before exit/);
assert.throws(() => run([snapshot], winner, { minimumEdgeTicks: -1 }), /minimumEdgeTicks/);
assert.throws(() => run([snapshot], winner, { minimumEdgeTicks: 0.5 }), /minimumEdgeTicks/);
console.log('PASS paired-driver market-making replay');
