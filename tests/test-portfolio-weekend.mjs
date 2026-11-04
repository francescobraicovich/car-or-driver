import assert from 'node:assert/strict';
import { replayPortfolio } from '../research/prediction-markets/portfolio/replay.mjs';

const base = () => ({
  race: 'Example Grand Prix',
  firstPractice: 2000,
  raceStart: 10000,
  exitTime: 9000,
  resolution: { type: 'winner', driver: 'A' },
  markets: [
    {
      id: 'a',
      driver: 'A',
      initialCompleteSets: 5,
      fairValue: { probability: 0.6, asOf: 1000, dataThrough: 900 },
      coverage: { complete: true, start: 1000, end: 9000 },
    },
  ],
  blackouts: [{ start: 4000, end: 7000, observedThrough: 4000 }],
  events: [
    { market: 'a', type: 'snapshot', timestamp: 1000, bids: [[0.3, 1]], asks: [[0.7, 1]] },
    { market: 'a', type: 'trade', timestamp: 1300, side: 'sell', price: 0.3, quantity: 3, eventId: 'entry' },
    { market: 'a', type: 'trade', timestamp: 4500, side: 'sell', price: 0.3, quantity: 100, eventId: 'blackout' },
    { market: 'a', type: 'update', timestamp: 7001, side: 'buy', price: 0.4, quantity: 100 },
    { market: 'a', type: 'trade', timestamp: 7002, side: 'sell', price: 0.3, quantity: 100, eventId: 'before-reseed' },
    { type: 'forecast', timestamp: 7003, dataThrough: 7002, probabilities: { a: 0.8 } },
    { market: 'a', type: 'snapshot', timestamp: 7100, bids: [[0.3, 4]], asks: [[0.6, 4]] },
    { market: 'a', type: 'snapshot', timestamp: 8100, bids: [[0.35, 4]], asks: [[0.6, 4]] },
  ],
});
const options = {
  initialCapital: 20,
  orderSize: 2,
  minimumOrderSize: 1,
  maxInventory: 5,
  tickSize: 0.01,
  minimumEdgeTicks: 1,
  inventorySkewTicks: 0,
  latencyMs: 100,
  cancelLatencyMs: 100,
  maxBookAgeMs: 10000,
  exitMode: 'conditionalSettlement',
  liquidationStartTime: 8000,
  takerFeeRate: 0,
  liquidationSlippageTicks: 1,
  holdingRiskMargin: 0.1,
};
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} is not ${expected}`);

const input = base();
const before = structuredClone(input);
const held = replayPortfolio(input, options);
assert.deepEqual(input, before, 'forecast updates never mutate the input');
assert.equal(held.complete, true);
assert.equal(held.fills.length, 1, 'no fills during blackout or before a new snapshot');
assert.equal(held.ignoredBeforeSnapshot, 2);
assert.equal(held.markets[0].holdDecision, 'hold');
close(held.profit, 1.4);
close(held.outcomeScenarios.worstWinnerProfit, -0.6);
close(held.outcomeScenarios.uniformHalfPayoutVoidProfit, 0.4);
const loss = base();
loss.resolution = { type: 'other' };
close(replayPortfolio(loss, options).profit, -0.6);

const lowForecast = base();
lowForecast.events.find((event) => event.type === 'forecast').probabilities.a = 0.2;
const closed = replayPortfolio(lowForecast, options);
assert.equal(closed.markets[0].holdDecision, 'close');
assert.equal(closed.fills.filter((fill) => fill.kind === 'liquidation').length, 1);
close(closed.profit, 0.08);
const lowForecastOther = structuredClone(lowForecast);
lowForecastOther.resolution = { type: 'other' };
close(replayPortfolio(lowForecastOther, options).profit, closed.profit);

const noReseed = base();
noReseed.events = noReseed.events.filter((event) => event.timestamp < 7100);
const missingBook = replayPortfolio(noReseed, options);
assert.equal(missingBook.complete, false);
assert.equal(missingBook.profit, null, 'missing post-blackout depth does not imply a favorable hold');
const entryHold = replayPortfolio(noReseed, { ...options, holdingReference: 'entry' });
assert.equal(entryHold.complete, true, 'an entry-based hold needs the forecast but not a current book');
close(entryHold.markets[0].averageEntryPrice, 0.3);
close(entryHold.profit, 1.4);
const entryNeedsClose = structuredClone(noReseed);
entryNeedsClose.events.find((event) => event.type === 'forecast').probabilities.a = 0.2;
assert.equal(
  replayPortfolio(entryNeedsClose, { ...options, holdingReference: 'entry' }).profit,
  null,
  'an unfavorable entry-based position cannot be closed without executable depth',
);
const forcedZeroDepth = replayPortfolio(entryNeedsClose, { ...options, holdingReference: 'entry', allowForcedCarry: true });
assert.equal(forcedZeroDepth.complete, true);
assert.equal(forcedZeroDepth.forcedCarries.length, 1);
close(forcedZeroDepth.forcedCarries[0].inventory, 2);
close(forcedZeroDepth.forcedCarries[0].basisAmount, 0.6);
close(forcedZeroDepth.forcedCarries[0].closedShares, 0);
close(forcedZeroDepth.profit, 1.4);
close(forcedZeroDepth.outcomeScenarios.worstWinnerProfit, -0.6);
assert.equal(forcedZeroDepth.fills.filter((fill) => fill.kind === 'liquidation').length, 0);
const equalEntryMargin = structuredClone(noReseed);
equalEntryMargin.events.find((event) => event.type === 'forecast').probabilities.a = 0.4;
assert.equal(
  replayPortfolio(equalEntryMargin, { ...options, holdingReference: 'entry' }).profit,
  null,
  'an edge equal to the entry margin must not pass due to floating-point error',
);
const noForecast = base();
noForecast.events = noForecast.events.filter((event) => event.type !== 'forecast');
assert.equal(replayPortfolio(noForecast, options).profit, null, 'a post-blackout forecast is required for a hold decision');
assert.equal(
  replayPortfolio(noForecast, { ...options, holdingReference: 'entry', allowForcedCarry: true }).profit,
  null,
  'forced carry cannot replace a missing post-blackout forecast',
);
assert.throws(() => replayPortfolio(base(), { ...options, allowForcedCarry: true }), /requires conditional settlement with entry-basis/);

const sundayOnly = base();
sundayOnly.blackouts[0].observedThrough = { a: 4000 };
sundayOnly.markets.push({
  id: 'b',
  driver: 'B',
  initialCompleteSets: 5,
  fairValue: { probability: 0.1, asOf: 1000, dataThrough: 900 },
  coverage: { complete: false, start: 7101, end: 9000 },
});
sundayOnly.events.find((event) => event.type === 'forecast').probabilities.b = 0.1;
sundayOnly.events.splice(sundayOnly.events.length - 1, 0, {
  market: 'b',
  type: 'snapshot',
  timestamp: 7101,
  bids: [[0.1, 1]],
  asks: [[0.2, 1]],
});
const sundayResult = replayPortfolio(sundayOnly, { ...options, allowUnverifiedData: true });
assert.equal(sundayResult.complete, true, 'a Sunday-only market needs no fabricated Saturday tape');
assert.equal(
  sundayResult.fills.some((fill) => fill.market === 'b' && fill.timestamp < 7101),
  false,
);
const noPriorTape = structuredClone(sundayOnly);
noPriorTape.blackouts[0].observedThrough = {};
assert.throws(() => replayPortfolio(noPriorTape, { ...options, allowUnverifiedData: true }), /every earlier market/);

const short = base();
short.events[1] = { market: 'a', type: 'trade', timestamp: 1300, side: 'buy', price: 0.7, quantity: 3, eventId: 'short-entry' };
short.events.find((event) => event.type === 'forecast').probabilities.a = 0.1;
const shortHeld = replayPortfolio(short, options);
assert.equal(shortHeld.markets[0].holdDecision, 'hold');
close(shortHeld.profit, -0.6);
close(shortHeld.outcomeScenarios.other, 1.4);

const weightedBasis = base();
weightedBasis.events = [
  weightedBasis.events[0],
  { market: 'a', type: 'trade', timestamp: 1001, side: 'sell', price: 0.3, quantity: 3, eventId: 'buy-1' },
  { market: 'a', type: 'snapshot', timestamp: 1002, bids: [[0.4, 1]], asks: [[0.7, 1]] },
  { market: 'a', type: 'trade', timestamp: 1003, side: 'sell', price: 0.4, quantity: 3, eventId: 'buy-2' },
  { market: 'a', type: 'trade', timestamp: 1004, side: 'buy', price: 0.7, quantity: 2, eventId: 'reduce' },
  { type: 'forecast', timestamp: 7003, dataThrough: 7002, probabilities: { a: 0.8 } },
];
const weightedResult = replayPortfolio(weightedBasis, { ...options, latencyMs: 0, cancelLatencyMs: 0, holdingReference: 'entry' });
assert.equal(
  weightedResult.fills.find((fill) => fill.eventId === 'reduce').quantity,
  1,
  'decimal-equivalent prices retain the displayed queue ahead',
);
close(weightedResult.markets[0].inventory, 3);
close(weightedResult.markets[0].averageEntryPrice, 0.35);
close(weightedResult.markets[0].inventoryBasis, 1.05);
close(weightedResult.profit, 2.3);

const crossedBasis = base();
crossedBasis.events = [
  crossedBasis.events[0],
  { market: 'a', type: 'trade', timestamp: 1001, side: 'sell', price: 0.3, quantity: 3, eventId: 'long' },
  { market: 'a', type: 'trade', timestamp: 1002, side: 'buy', price: 0.7, quantity: 5, eventId: 'cross-to-short' },
  { type: 'forecast', timestamp: 7003, dataThrough: 7002, probabilities: { a: 0.2 } },
];
const crossedResult = replayPortfolio(crossedBasis, {
  ...options,
  orderSize: 4,
  latencyMs: 0,
  cancelLatencyMs: 0,
  holdingReference: 'entry',
});
close(crossedResult.markets[0].inventory, -2);
close(crossedResult.markets[0].averageEntryPrice, 0.7);
close(crossedResult.markets[0].inventoryBasis, 1.4);
close(crossedResult.profit, 0.2);

const crossedLong = base();
crossedLong.events = [
  crossedLong.events[0],
  { market: 'a', type: 'trade', timestamp: 1001, side: 'buy', price: 0.7, quantity: 3, eventId: 'short' },
  { market: 'a', type: 'trade', timestamp: 1002, side: 'sell', price: 0.3, quantity: 5, eventId: 'cross-to-long' },
  { type: 'forecast', timestamp: 7003, dataThrough: 7002, probabilities: { a: 0.8 } },
];
const crossedLongResult = replayPortfolio(crossedLong, {
  ...options,
  orderSize: 4,
  latencyMs: 0,
  cancelLatencyMs: 0,
  holdingReference: 'entry',
});
close(crossedLongResult.markets[0].inventory, 2);
close(crossedLongResult.markets[0].averageEntryPrice, 0.3);
close(crossedLongResult.markets[0].inventoryBasis, 0.6);
close(crossedLongResult.profit, 2.2);

const coupled = base();
coupled.markets.push({
  id: 'b',
  driver: 'B',
  initialCompleteSets: 5,
  fairValue: { probability: 0.2, asOf: 1000, dataThrough: 900 },
  coverage: { complete: true, start: 1001, end: 9000 },
});
coupled.events.find((event) => event.type === 'forecast').probabilities = { a: 0.7, b: 0.25 };
coupled.events.at(-1).bids = [[0.1, 4]];
coupled.events.push(
  { market: 'b', type: 'snapshot', timestamp: 1001, bids: [[0.1, 1]], asks: [[0.7, 1]] },
  { market: 'b', type: 'trade', timestamp: 1301, side: 'sell', price: 0.1, quantity: 3, eventId: 'entry-b' },
  { market: 'b', type: 'snapshot', timestamp: 7101, bids: [[0.1, 4]], asks: [[0.6, 4]] },
  { market: 'b', type: 'snapshot', timestamp: 8101, bids: [[0.1, 4]], asks: [[0.6, 4]] },
);
coupled.events.sort((a, b) => a.timestamp - b.timestamp);
const joint = replayPortfolio(coupled, options);
assert.equal(joint.markets.filter((market) => market.holdDecision === 'hold').length, 2);
close(joint.profit, 1.2);
close(joint.outcomeScenarios.winners.find((row) => row.driver === 'B').profit, 1.2);
close(joint.outcomeScenarios.other, -0.8);
close(joint.outcomeScenarios.worstWinnerProfit, -0.8);

const threshold = base();
threshold.events.find((event) => event.type === 'forecast').probabilities.a = 0.5;
threshold.events.at(-1).bids = [[0.375, 4]];
const exactlyThreshold = replayPortfolio(threshold, { ...options, liquidationSlippageTicks: 0, holdingRiskMargin: 0.125 });
assert.equal(exactlyThreshold.markets[0].holdDecision, 'close', 'equal advantage does not exceed the risk threshold');

const depthWeighted = base();
depthWeighted.events.find((event) => event.type === 'forecast').probabilities.a = 0.45;
depthWeighted.events.at(-1).bids = [
  [0.5, 1],
  [0.1, 1],
];
const weighted = replayPortfolio(depthWeighted, options);
assert.equal(weighted.markets[0].holdDecision, 'hold', 'holding uses the executable price across the full position, not just best bid');
close(weighted.holdingDecisions.at(-1).executableValue, 0.29);
const insufficientDepth = structuredClone(depthWeighted);
insufficientDepth.events.at(-1).bids = [[0.5, 1]];
const insufficient = replayPortfolio(insufficientDepth, options);
assert.equal(insufficient.complete, false, 'a partial executable quote cannot classify the entire position');
assert.equal(insufficient.profit, null);
const partialClose = base();
partialClose.events.find((event) => event.type === 'forecast').probabilities.a = 0.2;
partialClose.events.at(-1).bids = [[0.35, 1]];
const partialResult = replayPortfolio(partialClose, { ...options, holdingReference: 'entry', allowForcedCarry: true });
assert.equal(partialResult.complete, true);
assert.equal(partialResult.forcedCarries.length, 1);
close(partialResult.forcedCarries[0].inventory, 1);
close(partialResult.forcedCarries[0].basisAmount, 0.3);
close(partialResult.forcedCarries[0].closedShares, 1);
close(partialResult.forcedCarries[0].closingSlippage, 0.01);
close(partialResult.fills.find((fill) => fill.kind === 'liquidation').quantity, 1);
close(partialResult.profit, 0.74);
close(partialResult.outcomeScenarios.worstWinnerProfit, -0.26);

const newerForecastWithoutBook = base();
newerForecastWithoutBook.events.push({ type: 'forecast', timestamp: 8990, dataThrough: 8990, probabilities: { a: 0.1 } });
const unresolved = replayPortfolio(newerForecastWithoutBook, { ...options, maxBookAgeMs: 500 });
assert.equal(unresolved.profit, null, 'a newer forecast invalidates a hold until a usable exit book is available');
const depthDisappears = base();
depthDisappears.events.push({ market: 'a', type: 'update', timestamp: 8500, side: 'buy', price: 0.35, quantity: 1 });
assert.equal(replayPortfolio(depthDisappears, options).profit, null, 'lost depth invalidates a previous full-position holding comparison');
const depthTraded = base();
depthTraded.events.push({
  market: 'a',
  type: 'trade',
  timestamp: 8500,
  side: 'sell',
  price: 0.35,
  quantity: 1,
  eventId: 'exit-depth-traded',
});
assert.equal(replayPortfolio(depthTraded, options).profit, null, 'an observed trade at the exit price invalidates stale displayed depth');

const invalidForecast = base();
invalidForecast.events.find((event) => event.type === 'forecast').dataThrough = 7004;
assert.throws(() => replayPortfolio(invalidForecast, options), /Invalid or future portfolio forecast/);
invalidForecast.events.find((event) => event.type === 'forecast').dataThrough = 7002;
invalidForecast.events.find((event) => event.type === 'forecast').probabilities = {};
assert.throws(() => replayPortfolio(invalidForecast, options), /Invalid or future portfolio forecast/);
const noObservedTape = base();
noObservedTape.blackouts[0].observedThrough = 3999;
assert.throws(() => replayPortfolio(noObservedTape, options), /observed cancellation tape/);
const afterRace = base();
afterRace.exitTime = afterRace.raceStart;
assert.throws(() => replayPortfolio(afterRace, options), /precede race start/);
assert.throws(() => replayPortfolio(base(), { ...options, liquidationStartTime: null }), /requires raceStart/);

const draining = base();
draining.events = [
  draining.events[0],
  { market: 'a', type: 'trade', timestamp: 3850, side: 'sell', price: 0.3, quantity: 3, eventId: 'during-cancel' },
  { market: 'a', type: 'trade', timestamp: 3950, side: 'sell', price: 0.3, quantity: 100, eventId: 'after-cancel' },
  ...draining.events.slice(5),
];
const drainResult = replayPortfolio(draining, options);
assert.deepEqual(
  drainResult.fills.filter((fill) => fill.kind === 'maker').map((fill) => fill.eventId),
  ['during-cancel'],
);
console.log('PASS weekend forecasts, blackout, holding decisions and correlated payout scenarios');
