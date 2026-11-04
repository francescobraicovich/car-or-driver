import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adaptWinnerCapture } from '../research/prediction-markets/portfolio/adapt-pmxt.mjs';

const root = 'research/prediction-markets';
const read = (path) => JSON.parse(readFileSync(`${root}/${path}`, 'utf8'));
const base = () => {
  const forecast = read('forecast/austrian-2026-baseline.json');
  return {
    capture: read('polymarket/austrian-2026-june-25-winner-events.json'),
    official: read('polymarket/austrian-2026-official-outcomes.json'),
    forecast,
    onchain: read('polymarket/onchain/winner/winner-onchain-events.json'),
    dataThrough: Date.parse(forecast.results[0].decisionTime),
    exitTime: Date.parse('2026-06-25T16:00:00Z'),
    resolution: {
      type: 'winner',
      driver: 'George Russell',
      winnerConditionId: '0xad67da53baaabe17272aa2a4cd67776585779422267579e91de9c50ec2c1fb72',
    },
  };
};
const adapted = adaptWinnerCapture(base());
assert.ok(adapted.input.markets.every((m) => m.coverage.complete === false));
assert.equal(adapted.provenance.historicalForecastVintageVerified, false);
const teammate = base();
const originalNorris = teammate.official.markets.find((market) => market.slug.includes('winner-norris-'));
const piastri = {
  ...originalNorris,
  slug: originalNorris.slug.replace('winner-norris-', 'winner-piastri-'),
  conditionId: 'synthetic-piastri-condition',
  clobTokenIds: ['synthetic-piastri-yes', 'synthetic-piastri-no'],
};
teammate.official.markets.push(piastri);
const sourceBook = teammate.capture.rows.find(
  (row) =>
    row.type === 'book' &&
    row.condition === originalNorris.conditionId &&
    row.asset === originalNorris.clobTokenIds[0] &&
    row.received >= Date.parse(teammate.forecast.results[0].decisionTime),
);
assert.ok(sourceBook);
teammate.capture.rows.push({ ...sourceBook, condition: piastri.conditionId, asset: piastri.clobTokenIds[0] });
const leclerc = {
  ...originalNorris,
  slug: originalNorris.slug.replace('winner-norris-', 'winner-leclerc-'),
  conditionId: 'synthetic-leclerc-condition',
  clobTokenIds: ['synthetic-leclerc-yes', 'synthetic-leclerc-no'],
};
teammate.official.markets.push(leclerc);
teammate.capture.rows.push({ ...sourceBook, condition: leclerc.conditionId, asset: leclerc.clobTokenIds[0] });
teammate.driverSpecs = [
  ['norris', 'Lando Norris'],
  ['piastri', 'Oscar Piastri'],
  ['hamilton', 'Lewis Hamilton'],
  ['leclerc', 'Charles Leclerc'],
];
assert.deepEqual(
  adaptWinnerCapture(teammate).input.markets.map((market) => market.driver),
  ['Lando Norris', 'Oscar Piastri', 'Lewis Hamilton', 'Charles Leclerc'],
);
assert.throws(
  () =>
    adaptWinnerCapture({
      ...teammate,
      driverSpecs: [
        ['norris', 'Lando Norris'],
        ['norris', 'Lando Norris'],
      ],
    }),
  /unique/,
);
assert.throws(() => adaptWinnerCapture({ ...teammate, driverSpecs: [] }), /At least one/);
const transaction = '0x024d44b559d8df60dd7635a9d0dc93664f45faf48a2304cfc11bdae020cd1730';
const legs = adapted.input.events.filter((e) => e.transactionHash === transaction);
assert.equal(legs.length, 2, 'multi-price taker prints are separated into actual maker price levels');
assert.equal(new Set(legs.map((e) => e.eventId)).size, 2);
assert.deepEqual(legs.map((e) => [e.side, e.price, Math.round(e.quantity * 100) / 100]).sort(), [
  ['buy', 0.22, 40],
  ['buy', 0.23, 226.77],
]);
const duplicate = base();
const print = duplicate.capture.rows.find((r) => r.transactionHash === transaction);
duplicate.capture.rows.push({ ...print });
assert.throws(() => adaptWinnerCapture(duplicate), /Duplicate trade transaction/);
const invalidNo = base();
const noIds = new Set(invalidNo.official.markets.map((m) => m.clobTokenIds[1]));
const noPrint = invalidNo.capture.rows.find(
  (r) => r.type === 'last_trade_price' && noIds.has(r.asset) && r.received > Date.parse(invalidNo.forecast.results[0].decisionTime),
);
noPrint.side = 'INVALID';
assert.throws(() => adaptWinnerCapture(invalidNo), /Invalid exchange print side/);
const invalidPrice = base();
invalidPrice.capture.rows.find((r) => r.transactionHash === transaction).price = '0.80';
assert.throws(() => adaptWinnerCapture(invalidPrice), /price does not match/);
const roundedPrint = base();
roundedPrint.capture.rows.find((r) => r.transactionHash === transaction).price = '0.229';
assert.throws(() => adaptWinnerCapture(roundedPrint), /price does not match/);
const vwap = adaptWinnerCapture({ ...roundedPrint, allowRoundedVwap: true });
assert.equal(vwap.provenance.roundedVwapAssumptions.length, 1);
assert.equal(vwap.provenance.roundedVwapAssumptions[0].transactionHash, transaction);
assert.equal(vwap.input.events.filter((e) => e.transactionHash === transaction).length, 2);
const badSummary = base();
badSummary.capture.rows.find((r) => r.transactionHash === transaction).price = '0.229';
const summary = badSummary.onchain.find((r) => r.transactionHash === transaction && r.takerIsExchange);
summary.makerAmountFilled = String(Number(summary.makerAmountFilled) + 1);
assert.throws(() => adaptWinnerCapture({ ...badSummary, allowRoundedVwap: true }), /price does not match/);
const wrongVwap = base();
wrongVwap.capture.rows.find((r) => r.transactionHash === transaction).price = '0.228';
assert.throws(() => adaptWinnerCapture({ ...wrongVwap, allowRoundedVwap: true }), /price does not match/);
const mismatched = base();
mismatched.resolution.driver = 'Lando Norris';
assert.throws(() => adaptWinnerCapture(mismatched), /conflicts with a selected market payout/);
const wrongWinner = base();
wrongWinner.resolution.winnerConditionId = 'wrong';
assert.throws(() => adaptWinnerCapture(wrongWinner), /not corroborated/);
const other = base();
other.resolution = { type: 'other' };
assert.throws(() => adaptWinnerCapture(other), /Other resolution is not corroborated/);
const gap = base();
gap.capture.rows.push({
  ...gap.capture.rows.find((r) => r.condition === adapted.input.markets[0].id && r.received > adapted.input.markets[0].coverage.start),
  type: 'gap',
});
assert.throws(() => adaptWinnerCapture(gap), /unreconciled data gap/);
const tick = base();
tick.capture.rows.push({
  ...tick.capture.rows.find((r) => r.condition === adapted.input.markets[0].id && r.received > adapted.input.markets[0].coverage.start),
  type: 'tick_size_change',
});
assert.throws(() => adaptWinnerCapture(tick), /dynamic-tick replay/);
const unknown = base();
unknown.capture.rows.push({
  ...unknown.capture.rows.find((r) => r.condition === adapted.input.markets[0].id && r.received > adapted.input.markets[0].coverage.start),
  type: 'unknown',
});
assert.throws(() => adaptWinnerCapture(unknown), /Unknown relevant capture event/);
const future = base();
future.dataThrough++;
assert.throws(() => adaptWinnerCapture(future), /future forecast/);
const raceStart = Date.parse('2026-06-28T13:00:00Z');
const weekend = { ...base(), raceStart, exitTime: raceStart - 60_000 };
assert.equal(adaptWinnerCapture(weekend).input.raceStart, raceStart);
assert.throws(() => adaptWinnerCapture({ ...weekend, raceStart: undefined }), /trading timestamps/);
assert.throws(() => adaptWinnerCapture({ ...weekend, exitTime: raceStart }), /trading timestamps/);
assert.throws(() => adaptWinnerCapture({ ...weekend, raceStart: Date.parse('2026-06-25T00:00:00Z') }), /race start/);
console.log('PASS conditional PMXT winner portfolio adapter');
