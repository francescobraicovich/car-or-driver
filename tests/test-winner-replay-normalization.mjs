import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeWinnerSample } from '../research/prediction-markets/polymarket/normalize_austrian_winner_sample.mjs';
import { replayMarket } from '../research/prediction-markets/backtest/replay.mjs';

const archive = JSON.parse(await readFile('research/prediction-markets/polymarket/austrian-2026-june-25-winner-events.json', 'utf8'));
const baseline = JSON.parse(await readFile('research/prediction-markets/forecast/austrian-2026-baseline.json', 'utf8'));
const sample = normalizeWinnerSample(archive, baseline);
assert.equal(sample.market.kind, 'race-winner');
assert.equal(sample.input.instrument.type, 'race-winner');
assert.equal(sample.forecast.value, 0.09604005545050225);
assert.equal(sample.input.fairValue.probability, sample.forecast.value);
assert.equal(sample.input.fairValue.asOf, sample.forecast.asOf);
assert.ok(sample.forecast.asOf < sample.input.events[0].timestamp);
assert.equal(sample.input.coverage.complete, false);
const trade = sample.input.events.find((event) => event.type === 'trade');
assert.equal(trade.side, 'sell', 'a NO buy is converted to a complementary YES sell');
assert.equal(trade.price, 0.05);
assert.equal(trade.quantity, 42.50526);
assert.throws(() => replayMarket(sample.input), /Verified coverage/, 'unverified historical data cannot become a backtest');
assert.throws(() => normalizeWinnerSample({ ...archive, coverageComplete: true }, baseline), /unverified raw PMXT/);
const badRows = archive.rows.map((row) => (row.transactionHash === trade.transactionHash ? { ...row, side: 'INVALID' } : row));
assert.throws(
  () => normalizeWinnerSample({ ...archive, rows: badRows }, baseline),
  /documented initial book and later complementary-token trade/,
);
assert.throws(() => normalizeWinnerSample(archive, { results: [] }), /dated Austrian Norris forecast proxy/);
const duplicate = archive.rows.find((row) => row.transactionHash === trade.transactionHash);
assert.throws(
  () => normalizeWinnerSample({ ...archive, rows: [...archive.rows, { ...duplicate, asset: sample.market.yesToken }] }, baseline),
  /documented initial book and later complementary-token trade/,
  'a transaction reported on both tokens cannot be counted twice',
);
console.log('PASS race-winner normalization and unverified coverage rejection');
