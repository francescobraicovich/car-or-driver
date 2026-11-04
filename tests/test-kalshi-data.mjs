import assert from 'node:assert/strict';
import { fetchArchive } from '../research/prediction-markets/kalshi/fetch-data.mjs';

const ticker = 'KXF1H2H-MEX26HAMRUS-HAM';
const market = { ticker, open_time: '2026-10-20T00:00:00Z', close_time: '2026-10-25T00:00:00Z' };
const calls = [];
const request = async (address) => {
  const url = new URL(address);
  calls.push(url);
  const path = url.pathname.replace('/trade-api/v2', '');
  let body;
  if (path === '/historical/cutoff') body = { market_settled_ts: '2026-10-30T00:00:00Z' };
  else if (path === '/markets') body = { markets: [], cursor: '' };
  else if (path === '/historical/markets') body = { markets: [market], cursor: '' };
  else if (path === '/markets/trades') body = { trades: [], cursor: '' };
  else if (path === '/historical/trades') {
    body = url.searchParams.has('cursor')
      ? { trades: [{ trade_id: 'second' }], cursor: '' }
      : { trades: [{ trade_id: 'first' }], cursor: 'next' };
  } else if (path === `/historical/markets/${ticker}/candlesticks`) body = { ticker, candlesticks: [] };
  else throw Error(`Unexpected request ${url}`);
  return { ok: true, json: async () => body };
};
const archive = await fetchArchive({ request, ticker, now: new Date('2026-11-01T00:00:00Z') });
assert.equal(archive.market_count, 1);
assert.equal(archive.records.length, calls.length);
assert.equal(archive.records.filter((record) => record.body.trades?.length).length, 2, 'preserves every paginated trade response');
const candles = calls.filter((url) => url.pathname.endsWith('/candlesticks'));
assert.equal(candles.length, 2, 'long history is split to fit the candle limit');
assert.equal(candles[0].searchParams.get('end_ts'), candles[1].searchParams.get('start_ts'), 'no gap between windows');
assert.ok(
  calls.some((url) => url.pathname.endsWith('/markets/trades')),
  'current trades queried',
);
assert.ok(
  calls.some((url) => url.pathname.endsWith('/historical/trades')),
  'historical trades queried',
);
assert.ok(calls.filter((url) => url.pathname.endsWith('/markets')).every((url) => url.searchParams.get('series_ticker') === 'KXF1H2H'));
await assert.rejects(fetchArchive({ request, ticker: '../bad' }), /Invalid F1 matchup/);
await assert.rejects(fetchArchive({ request: async () => ({ ok: false, status: 429 }) }), /Kalshi request failed \(429\)/);
const repeated = async (address) => {
  const url = new URL(address);
  if (url.pathname.endsWith('/historical/cutoff')) return { ok: true, json: async () => ({}) };
  return { ok: true, json: async () => ({ markets: [], cursor: 'same' }) };
};
await assert.rejects(fetchArchive({ request: repeated }), /Repeated cursor/);
console.log('PASS Kalshi data archive: pagination, endpoint tiers, candle windows, and invalid responses');
