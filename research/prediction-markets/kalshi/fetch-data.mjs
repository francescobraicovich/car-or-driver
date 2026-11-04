// Archive public Kalshi F1 matchup data, retaining each unmodified API response.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = 'https://external-api.kalshi.com/trade-api/v2';
const SERIES = 'KXF1H2H';
const CANDLE_SECONDS = 60;
const MAX_CANDLES = 4000;

export async function fetchArchive({ request = fetch, ticker = null, now = new Date() } = {}) {
  if (ticker !== null && !/^KXF1H2H-[A-Z0-9-]+$/.test(ticker)) throw Error('Invalid F1 matchup market ticker');
  if (!Number.isFinite(now.valueOf())) throw Error('Invalid collection time');
  const records = [];
  async function read(path, parameters = {}) {
    const url = new URL(BASE + path);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
    const response = await request(url.toString(), { headers: { accept: 'application/json' } });
    if (!response.ok) throw Error(`Kalshi request failed (${response.status}): ${url}`);
    const body = await response.json();
    records.push({ url: url.toString(), retrieved_at: new Date().toISOString(), body });
    return body;
  }
  async function pages(path, parameters, field) {
    const items = [];
    const cursors = new Set();
    let cursor = '';
    do {
      const body = await read(path, { ...parameters, limit: 1000, ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(body[field]) || typeof body.cursor !== 'string') throw Error(`Invalid ${field} response from ${path}`);
      items.push(...body[field]);
      cursor = body.cursor;
      if (cursor && cursors.has(cursor)) throw Error(`Repeated cursor from ${path}`);
      cursors.add(cursor);
    } while (cursor);
    return items;
  }

  const cutoff = await read('/historical/cutoff');
  // Query both tiers instead of guessing which side of an exchange handoff a market or trade occupies.
  const query = { series_ticker: SERIES, ...(ticker ? { tickers: ticker } : {}) };
  const currentMarkets = await pages('/markets', query, 'markets');
  const historicalMarkets = await pages('/historical/markets', query, 'markets');
  const markets = new Map();
  for (const market of [...currentMarkets, ...historicalMarkets]) {
    if (typeof market.ticker !== 'string' || !market.ticker.startsWith(`${SERIES}-`)) throw Error('Unexpected market in series response');
    if (ticker && market.ticker !== ticker) throw Error('Unexpected market in ticker response');
    markets.set(market.ticker, market);
  }
  for (const market of markets.values()) {
    for (const endpoint of ['/markets/trades', '/historical/trades']) await pages(endpoint, { ticker: market.ticker }, 'trades');
    const start = Date.parse(market.open_time) / 1000;
    const close = Date.parse(market.close_time) / 1000;
    const end = Math.min(close, Math.floor(now.valueOf() / 1000));
    if (!Number.isFinite(start) || !Number.isFinite(close)) throw Error(`Market ${market.ticker} lacks valid open or close time`);
    if (end < start) continue;
    const historical = historicalMarkets.some((item) => item.ticker === market.ticker);
    const path = historical
      ? `/historical/markets/${encodeURIComponent(market.ticker)}/candlesticks`
      : `/series/${SERIES}/markets/${encodeURIComponent(market.ticker)}/candlesticks`;
    // Window endpoints overlap intentionally: Kalshi defines intervals by candle end time.
    for (let windowStart = Math.floor(start); windowStart <= end; ) {
      const windowEnd = Math.min(end, windowStart + MAX_CANDLES * CANDLE_SECONDS);
      await read(path, { start_ts: windowStart, end_ts: windowEnd, period_interval: 1 });
      if (windowEnd === end) break;
      windowStart = windowEnd;
    }
  }
  return { exchange: 'kalshi', series: SERIES, collection_started_at: now.toISOString(), cutoff, market_count: markets.size, records };
}

async function main(args) {
  if (![2, 4].includes(args.length) || args[0] !== '--output' || (args.length === 4 && args[2] !== '--ticker')) {
    throw Error('Usage: node research/prediction-markets/kalshi/fetch-data.mjs --output FILE [--ticker KXF1H2H-...]');
  }
  const archive = await fetchArchive({ ticker: args[3] ?? null });
  const path = resolve(args[1]);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(archive, null, 2) + '\n', { flag: 'wx' });
  console.log(`Archived ${archive.market_count} markets and ${archive.records.length} API responses to ${path}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
