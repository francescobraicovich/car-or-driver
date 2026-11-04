import assert from 'node:assert/strict';
import {
  summarizeFlatSeries,
  runFlatSeries,
  selectTrainingCandidates,
} from '../research/prediction-markets/pmdata/all-drivers/optimization.mjs';

const market = [{ inventory: 0 }];
const row = (race, buy, sell, fee = 0) => ({
  race,
  complete: true,
  profit: sell - buy - fee,
  markets: market,
  fills: [
    { market: 'a', kind: 'maker', side: 'buy', quantity: 1, price: buy, fee: 0 },
    { market: 'a', kind: 'liquidation', side: 'sell', quantity: 1, price: sell, fee },
  ],
});
const rows = [row('one', 0.4, 0.5, 0.01), row('two', 0.5, 0.45)];
const result = summarizeFlatSeries(rows, 500, 0.01);
assert.equal(result.available, true);
assert.equal(result.makerFills, 2);
assert.equal(result.liquidationFills, 2);
assert.equal(result.matchedShares, 2);
assert.equal(result.makerMatchedShares, 0);
const twoSided = summarizeFlatSeries([{ ...rows[0], fills: [rows[0].fills[0], { ...rows[0].fills[1], kind: 'maker' }] }]);
assert.equal(twoSided.makerMatchedShares, 1);
assert.equal(result.tradedRaces, 2);
assert.ok(Math.abs(result.fees - 0.01) < 1e-12);
assert.ok(Math.abs(result.grossCashBeforeFeesAndAssumedSlippage - 0.07) < 1e-12);
assert.ok(Math.abs(result.profit - 0.04) < 1e-9);
assert.equal(summarizeFlatSeries([{ ...rows[0], complete: false, profit: null }]).available, false);
assert.equal(summarizeFlatSeries([{ ...rows[0], markets: [{ inventory: 1 }] }]).available, false);
assert.throws(() => summarizeFlatSeries([{ ...rows[0], profit: 1 }]), /disagrees/);
assert.throws(() => summarizeFlatSeries([{ ...rows[0], fills: rows[0].fills.slice(0, 1) }]), /flat position/);
const noTrade = summarizeFlatSeries([{ race: 'zero', complete: true, profit: 0, fills: [], markets: market }]);
assert.equal(noTrade.sharpePerRace, null);
assert.equal(noTrade.illustrativeAnnualizedSharpe, null);

const entries = [0, 2].map((start, i) => ({ tradingStart: start, input: { exitTime: start + 1 }, split: 'training', i }));
const seenCapital = [];
const series = runFlatSeries(entries, (entry, capital) => {
  seenCapital.push(capital);
  return { ...rows[entry.i], exitMode: 'liquidation' };
});
assert.equal(series.races.length, 2);
assert.ok(Math.abs(seenCapital[1] - 3000.09) < 1e-9);
assert.throws(() => runFlatSeries([entries[1], entries[0]], () => ({})), /liquidation|ordered/);
const unfinished = runFlatSeries(entries, () => ({ ...rows[0], complete: false, profit: null, exitMode: 'liquidation' }));
assert.equal(unfinished.finalCapital, null);
assert.equal(unfinished.races.length, 1);

const search = selectTrainingCandidates(
  ({ activity }) => ({ available: true, makerFills: activity * 5, tradedRaces: activity, sharpePerRace: activity }),
  { activity: [0, 1, 2, 3] },
  { activity: 0 },
);
assert.equal(search.trials.length, 4);
assert.equal(search.selected.parameters.activity, 3);
assert.equal(search.selected.objective, 3);
const invalid = selectTrainingCandidates(
  () => ({ available: true, makerFills: 100, tradedRaces: 1, sharpePerRace: 10 }),
  { n: [0, 1] },
  { n: 0 },
);
assert.equal(invalid.selected, null);
assert.throws(() => selectTrainingCandidates(() => ({}), { n: [0] }, { n: 1 }), /grid/);
console.log('PASS all-driver flat portfolio optimization');
