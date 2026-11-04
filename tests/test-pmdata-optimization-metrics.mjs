import assert from 'node:assert/strict';
import {
  performanceMetrics,
  eligibleObjective,
  independentLiquidationMetrics,
} from '../research/prediction-markets/pmdata/optimization/metrics.mjs';

const results = [
  { capitalBefore: 100, capitalAfter: 100, fills: [] },
  { capitalBefore: 100, capitalAfter: 110, fills: [{}] },
  { capitalBefore: 110, capitalAfter: 99, fills: [{}] },
];
const m = performanceMetrics(results);
assert.equal(m.races, 3);
assert.equal(m.tradedRaces, 2);
assert.deepEqual(m.returns, [0, 0.1, -0.1]);
assert.ok(Math.abs(m.sharpePerRace) < 1e-12);
assert.ok(Math.abs(m.sortinoPerRace) < 1e-12);
assert.ok(Math.abs(m.profitFactor - 10 / 11) < 1e-12);
assert.ok(Math.abs(m.maxSettledDrawdown - 0.1) < 1e-12);
assert.ok(Math.abs(m.worstSettledRaceReturn - -0.1) < 1e-12);
assert.ok(Math.abs(m.returnToSettledDrawdown - -0.1) < 1e-12);
assert.equal(eligibleObjective(m), 0);
const zero = performanceMetrics([{ capitalBefore: 100, capitalAfter: 100, fills: [] }]);
assert.equal(zero.sharpePerRace, null);
assert.equal(zero.sortinoPerRace, null);
assert.equal(zero.profitFactor, null);
assert.equal(zero.returnToSettledDrawdown, null);
assert.equal(eligibleObjective(zero), null);
const profitable = performanceMetrics([
  { capitalBefore: 100, capitalAfter: 100, fills: [] },
  { capitalBefore: 100, capitalAfter: 101, fills: [{}] },
]);
assert.equal(profitable.sortinoPerRace, null);
assert.equal(profitable.profitFactor, null);
assert.equal(eligibleObjective(profitable), null, 'one active race is not an eligible optimization objective');
assert.throws(() => performanceMetrics([{ capitalBefore: 99, capitalAfter: 100, fills: [] }]), /carry forward/);
assert.throws(() => performanceMetrics([{ capitalBefore: 100, capitalAfter: NaN, fills: [] }]), /settled race/);
const close = independentLiquidationMetrics([
  { complete: true, profit: 10, fills: [{ kind: 'maker' }] },
  { complete: true, profit: -5, fills: [{ kind: 'maker' }, { kind: 'liquidation' }] },
]);
assert.equal(close.sumIndependentProfits, 5);
assert.equal(close.profitFactor, 2);
assert.equal(close.tradedRaces, 2);
assert.ok(Math.abs(close.maxHypotheticalResetDrawdown - 5 / 110) < 1e-12);
assert.equal(independentLiquidationMetrics([{ complete: false, profit: null, fills: [] }]).available, false);
console.log('PASS race-level strategy optimization metrics');
