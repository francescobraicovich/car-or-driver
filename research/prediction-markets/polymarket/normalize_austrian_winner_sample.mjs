// Construct a replay input from one recorded race-winner YES book and a matching print.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CONDITION = '0x4660332081e4aca6fe2456ceb6370f49366257ee43ed138cdb14ced55158a3b5';
const YES = '24216312900714616454605626938457375146268588031086210672731405048715498030153';
const NO = '34796736142026392511185687667807746522769353124596851711940302139688791509909';
const TRADE = '0x1eb338278faa3506334b3e2eff4204df98612d57c25c6f6b2b8e0929dd0fa931';
const AS_OF = Date.parse('2026-06-25T14:00:00.000Z');
const FIRST_PRACTICE = Date.parse('2026-06-26T11:30:00.000Z');

/** Preserve receipt/source times and mark the archive's continuity as unverified. */
export function normalizeWinnerSample(archive, baseline) {
  if (!Array.isArray(archive?.rows) || archive.coverageComplete !== false) throw Error('Expected an unverified raw PMXT archive');
  const raceForecast = baseline?.results?.find((result) => result.raceId === '1176');
  const probability = raceForecast?.roster?.find((driver) => driver.driverId === '846')?.probability;
  if (!Number.isFinite(probability) || probability < 0 || probability > 1 || Date.parse(raceForecast.decisionTime) !== AS_OF) {
    throw Error('Expected the dated Austrian Norris forecast proxy');
  }
  const rows = archive.rows.filter((row) => row.condition === CONDITION);
  const initial = rows.find((row) => row.asset === YES && row.type === 'book' && row.received >= AS_OF);
  const trades = rows.filter((row) => row.type === 'last_trade_price' && row.transactionHash === TRADE);
  const trade = trades[0];
  if (!initial || trades.length !== 1 || trade.asset !== NO || trade.side !== 'BUY' || trade.received <= initial.received + 1000) {
    throw Error('Expected the documented initial book and later complementary-token trade');
  }
  const events = [];
  for (const row of rows) {
    if (row.received < initial.received || row.received > trade.received) continue;
    const common = { timestamp: row.received, sourceTimestamp: row.source };
    if (row.asset === YES && row.type === 'book') {
      events.push({ type: 'snapshot', ...common, bids: JSON.parse(row.bids).map((level) => level.map(Number)), asks: JSON.parse(row.asks).map((level) => level.map(Number)) });
    } else if (row.asset === YES && row.type === 'price_change') {
      if (!['BUY', 'SELL'].includes(row.side)) throw Error('Invalid level-change side');
      events.push({ type: 'update', ...common, side: row.side.toLowerCase(), price: Number(row.price), quantity: Number(row.size) });
    } else if (row.type === 'last_trade_price' && (row.asset === YES || row.asset === NO)) {
      if (row.transactionHash !== TRADE) throw Error('Unexpected print in selected single-print window');
      if (!['BUY', 'SELL'].includes(row.side)) throw Error('Invalid trade side');
      const isComplement = row.asset === NO;
      const side = row.side.toLowerCase();
      events.push({
        type: 'trade', ...common,
        side: isComplement ? (side === 'buy' ? 'sell' : 'buy') : side,
        price: isComplement ? Math.round((1 - Number(row.price)) * 1000000) / 1000000 : Number(row.price),
        quantity: Number(row.size), transactionHash: row.transactionHash,
        originalAsset: row.asset, originalSide: side,
      });
    }
  }
  if (events[0]?.type !== 'snapshot' || !events.some((event) => event.transactionHash === TRADE)) {
    throw Error('Normalized observations lack the initial snapshot or expected trade');
  }
  return {
    dataClassification: 'public archive; continuity unverified',
    market: { kind: 'race-winner', driver: 'Lando Norris', condition: CONDITION, yesToken: YES, noToken: NO, negRisk: true },
    forecast: {
      asOf: AS_OF, value: probability, kind: 'uncalibrated pace-only winner proxy',
      caveat: 'Parameter and source-data publication vintages were not independently verified; this is not a calibrated settlement probability.',
    },
    provenance: {
      sources: archive.sources, pmxtLicense: archive.source,
      cutoffReason: 'selected single-print window; not a continuous data certification',
      complementMapping: 'The selected NO buy is mapped to an economic YES sell; negative-risk execution and minting do not prove identical queue liquidity.',
    },
    input: {
      instrument: { type: 'race-winner', driver: 'Lando Norris', race: '2026 Austrian Grand Prix' },
      fairValue: { probability, asOf: AS_OF },
      firstPractice: FIRST_PRACTICE,
      exitTime: trade.received + 1000,
      exitMode: 'liquidation',
      coverage: { start: initial.received, end: trade.received + 1000, complete: false },
      events,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw Error('Usage: node normalize_austrian_winner_sample.mjs RAW.json OUTPUT.json');
    const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
    const baseline = JSON.parse(await readFile(new URL('../forecast/austrian-2026-baseline.json', import.meta.url), 'utf8'));
    await writeFile(process.argv[3], `${JSON.stringify(normalizeWinnerSample(input, baseline), null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
