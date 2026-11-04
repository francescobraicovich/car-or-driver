import assert from 'node:assert/strict';
import { publishedSportsFeeScenario } from '../research/prediction-markets/polymarket/historical-fees/sports-fee-scenarios.mjs';

const utc = (text) => Date.parse(text);
const before = publishedSportsFeeScenario(utc('2026-07-09T23:59:59.999Z'));
assert.equal(before.takerFeeRate, 0.03);
assert.equal(before.makerRebatePoolShare, 0.25);
assert.equal(before.makerFeeRate, 0);
assert.equal(before.requiresMarketVerification, true);
const after = publishedSportsFeeScenario(utc('2026-07-10T00:00:00.000Z'));
assert.equal(after.takerFeeRate, 0.05);
assert.equal(after.makerRebatePoolShare, 0.15);
assert.equal(publishedSportsFeeScenario(utc('2026-06-24T00:00:00.000Z')).takerFeeRate, 0.03);
assert.equal(publishedSportsFeeScenario(utc('2026-07-24T23:59:59.999Z')).takerFeeRate, 0.05);
assert.equal(publishedSportsFeeScenario(utc('2026-08-20T14:00:00.000Z')).takerFeeRate, 0.05);
assert.equal(publishedSportsFeeScenario(utc('2026-09-03T14:00:00.000Z')).takerFeeRate, 0.05);
assert.equal(publishedSportsFeeScenario(utc('2026-09-04T23:59:59.999Z')).takerFeeRate, 0.05);
for (const invalid of [NaN, Infinity, '2026-07-10', utc('2026-06-23T23:59:59.999Z'), utc('2026-09-05T00:00:00Z')]) {
  assert.throws(() => publishedSportsFeeScenario(invalid), /studied historical windows/);
}
console.log('PASS historical sports fee scenarios: UTC change boundary and invalid timestamps');
