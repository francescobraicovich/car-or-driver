import assert from 'node:assert/strict';
import { replayPortfolio } from '../research/prediction-markets/portfolio/replay.mjs';

const market = (id, driver, probability) => ({
  id,
  driver,
  initialCompleteSets: 1,
  fairValue: { probability, asOf: 1000, dataThrough: 900 },
  coverage: { complete: true, start: 1000, end: 2000 },
});
const base = () => ({
  race: 'Example Grand Prix',
  firstPractice: 3000,
  exitTime: 2000,
  resolution: { type: 'winner', driver: 'A' },
  markets: [market('a', 'A', 0.6), market('b', 'B', 0.3)],
  events: [
    { market: 'a', type: 'snapshot', timestamp: 1000, bids: [[0.3, 2]], asks: [[0.7, 2]] },
    { market: 'b', type: 'snapshot', timestamp: 1001, bids: [[0.2, 2]], asks: [[0.5, 2]] },
    { market: 'b', type: 'trade', timestamp: 1002, side: 'sell', price: 0.2, quantity: 20, eventId: 'b-trade' },
    { market: 'a', type: 'trade', timestamp: 1003, side: 'sell', price: 0.3, quantity: 20, eventId: 'a-trade' },
  ],
});
const settings = {
  initialCapital: 4,
  latencyMs: 0,
  maxInventory: 10,
  inventorySkewTicks: 0,
  maxBookAgeMs: 10000,
  tickSize: 0.01,
  minimumOrderSize: 1,
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} is not ${b}`);
const inactive = base();
inactive.markets.forEach((m) => {
  m.coverage.complete = false;
});
inactive.events = [
  { market: 'a', type: 'snapshot', timestamp: 1000, bids: [], asks: [] },
  { market: 'b', type: 'snapshot', timestamp: 1001, bids: [], asks: [] },
];
const inactiveResult = replayPortfolio(inactive, { ...settings, allowUnverifiedData: true });
assert.equal(inactiveResult.fills.length, 0, 'an empty inactive book must never produce orders or fills');
close(inactiveResult.cashBeforeSettlement, 2);
close(inactiveResult.settlementCash, 2);
close(inactiveResult.profit, 0);
const winner = replayPortfolio(base(), settings);
assert.equal(winner.coverageAttested, true);
assert.equal(winner.fills.length, 2);
close(winner.fills.find((x) => x.market === 'a').quantity, 5);
close(winner.fills.find((x) => x.market === 'b').quantity, 2.5);
close(winner.cashBeforeSettlement, 0);
close(winner.profit, 3);
assert.ok(winner.markets.every((m) => m.yes >= 0 && m.no >= 0));
const minimumSize = replayPortfolio(base(), { ...settings, minimumOrderSize: 5 });
assert.equal(minimumSize.fills.length, 1, 'a partially fundable order below the minimum must not be submitted');
assert.equal(minimumSize.fills[0].market, 'a');

const other = base();
other.resolution = { type: 'other' };
close(replayPortfolio(other, settings).profit, -2);
const externalWinner = base();
externalWinner.resolution = { type: 'winner', driver: 'Unselected Driver' };
close(replayPortfolio(externalWinner, settings).profit, -2);
const voided = base();
voided.resolution = { type: 'void', payouts: { a: 0.5, b: 0.5 } };
close(replayPortfolio(voided, settings).profit, 1.75);
for (const payouts of [undefined, { a: 0.5 }, { a: 1, b: 0.4 }, { a: 0, b: 1, c: 0 }]) {
  const value = base();
  value.resolution = { type: 'void', payouts };
  assert.throws(() => replayPortfolio(value, settings), /explicit verified payout/);
}
const unfunded = base();
unfunded.markets.forEach((m) => {
  m.initialCompleteSets = 0;
});
unfunded.events = [
  { market: 'a', type: 'snapshot', timestamp: 1000, bids: [[0.3, 1]], asks: [[0.7, 0.1]] },
  { market: 'b', type: 'snapshot', timestamp: 1001, bids: [[0.2, 1]], asks: [[0.5, 0.1]] },
  { market: 'a', type: 'trade', timestamp: 1002, side: 'buy', price: 0.7, quantity: 10, eventId: 'no-yes' },
];
assert.equal(
  replayPortfolio(unfunded, { ...settings, initialCapital: 0 }).fills.length,
  0,
  'cannot sell an unowned YES or spend unowned cash',
);

const latent = base();
latent.markets[0].fairValue.asOf = 1500;
latent.events = [
  latent.events[0],
  latent.events[1],
  { market: 'a', type: 'trade', timestamp: 1200, side: 'sell', price: 0.3, quantity: 30, eventId: 'premature' },
];
assert.equal(replayPortfolio(latent, settings).fills.length, 0, 'no order before the forecast exists');
const future = base();
future.markets[0].fairValue.dataThrough = 1001;
assert.throws(() => replayPortfolio(future, settings), /future inputs/);
const after = base();
after.exitTime = after.firstPractice;
assert.throws(() => replayPortfolio(after, settings), /precede first practice/);
const unknown = base();
unknown.events.push({ market: 'a', type: 'gap', timestamp: 1004 });
assert.throws(() => replayPortfolio(unknown, settings), /known data gap/);
const incomplete = base();
incomplete.markets[0].coverage.complete = false;
assert.throws(() => replayPortfolio(incomplete, settings), /Verified coverage/);
const conditional = replayPortfolio(incomplete, { ...settings, allowUnverifiedData: true });
assert.equal(conditional.coverageAttested, false);
assert.match(conditional.dataClassification, /conditional/);
assert.equal(incomplete.markets[0].coverage.complete, false, 'the input coverage attestation is never altered');
assert.throws(() => replayPortfolio(unknown, { ...settings, allowUnverifiedData: true }), /known data gap/);
const expensiveSets = base();
expensiveSets.markets[0].initialCompleteSets = 10;
assert.throws(() => replayPortfolio(expensiveSets, settings), /exceed initial capital/);
const duplicates = base();
duplicates.markets[1].driver = 'A';
assert.throws(() => replayPortfolio(duplicates, settings), /Duplicate/);
const repeatedPrint = base();
repeatedPrint.events.push({ ...repeatedPrint.events[3], timestamp: 1004 });
assert.throws(() => replayPortfolio(repeatedPrint, settings), /unique eventId/);
const missingPrintId = base();
delete missingPrintId.events[3].eventId;
assert.throws(() => replayPortfolio(missingPrintId, settings), /unique eventId/);
const separatePriceLeg = base();
separatePriceLeg.events.push({ ...separatePriceLeg.events[3], timestamp: 1004, price: 0.29, eventId: 'a-trade-other-price' });
assert.doesNotThrow(() => replayPortfolio(separatePriceLeg, settings), 'distinct maker price legs of a transaction are not duplicates');
const disordered = base();
disordered.events[0].sourceTimestamp = 999;
disordered.events[3].sourceTimestamp = 998;
assert.throws(() => replayPortfolio(disordered, settings), /out of order/);
assert.throws(() => replayPortfolio(disordered, { ...settings, allowSourceTimestampDisorder: true }), /conditional sensitivity opt-in/);
const disorderReport = replayPortfolio(disordered, { ...settings, allowUnverifiedData: true, allowSourceTimestampDisorder: true });
assert.equal(disorderReport.sourceTimestampReversals, 1);
assert.equal(disorderReport.worstSourceTimestampReversalMs, 1);
assert.match(disorderReport.dataClassification, /conditional/);
const futureSource = base();
futureSource.events[0].sourceTimestamp = 1001;
assert.throws(
  () => replayPortfolio(futureSource, { ...settings, allowUnverifiedData: true, allowSourceTimestampDisorder: true }),
  /invalid or too old/,
);
const delayedTrade = base();
delayedTrade.events = [
  delayedTrade.events[0],
  delayedTrade.events[1],
  {
    market: 'a',
    type: 'trade',
    timestamp: 1010,
    sourceTimestamp: 1001,
    side: 'sell',
    price: 0.3,
    quantity: 30,
    eventId: 'delayed-before-activation',
  },
];
const delayedReport = replayPortfolio(delayedTrade, { ...settings, latencyMs: 3 });
assert.equal(delayedReport.fills.length, 0, 'a trade sourced before activation cannot fill an order');
assert.equal(delayedReport.preactivationTradeEvents, 1);
const incoherent = base();
incoherent.markets[1].fairValue.probability = 0.5;
assert.throws(() => replayPortfolio(incoherent, settings), /cannot sum to more than one/);
const staggered = base();
staggered.markets[0].fairValue.probability = 0.8;
staggered.markets[1].fairValue.probability = 0.8;
staggered.markets[1].fairValue.asOf = 1200;
assert.throws(() => replayPortfolio(staggered, settings), /cannot sum to more than one/);
const crossed = base();
crossed.events[0].bids = [[0.8, 1]];
assert.throws(() => replayPortfolio(crossed, settings), /Crossed or locked/);
const crossedConditional = replayPortfolio(crossed, { ...settings, allowUnverifiedData: true });
assert.match(crossedConditional.dataClassification, /conditional/);
assert.equal(crossedConditional.crossedBookIntervals.length, 1);
assert.equal(crossedConditional.crossedBookIntervals[0].durationMs, 1000);

// One market buys at 0.30 and then walks 0.29 depth with a 0.01 slippage
// surcharge and Polymarket's price-dependent taker fee. No stale depth is reused.
const liquidation = {
  race: 'Example',
  firstPractice: 3000,
  exitTime: 2000,
  markets: [market('a', 'A', 0.6)],
  events: [
    { market: 'a', type: 'snapshot', timestamp: 1000, bids: [[0.3, 1]], asks: [[0.7, 1]] },
    { market: 'a', type: 'trade', timestamp: 1001, side: 'sell', price: 0.3, quantity: 3, eventId: 'entry' },
    { market: 'a', type: 'snapshot', timestamp: 1002, bids: [[0.29, 2]], asks: [[0.7, 1]] },
  ],
};
const liquidSettings = { ...settings, exitMode: 'liquidation', orderSize: 2, takerFeeRate: 0.05 };
const liquid = replayPortfolio(liquidation, liquidSettings);
assert.equal(liquid.complete, true);
close(liquid.fees, 2 * 0.05 * 0.28 * 0.72);
close(liquid.profit, -2 * (0.3 - 0.28 + 0.05 * 0.28 * 0.72));
const thin = structuredClone(liquidation);
thin.events[2].bids = [[0.29, 1]];
assert.equal(replayPortfolio(thin, liquidSettings).profit, null, 'insufficient liquidation depth is not valued optimistically');
assert.throws(() => replayPortfolio(liquidation, { ...settings, exitMode: 'liquidation' }), /explicit historical takerFeeRate/);
console.log('PASS shared-collateral winner portfolio replay');
