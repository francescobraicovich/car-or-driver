// Retrospective diagnostic on the optimizer's actual eligible markets.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { adjustedProbabilities } from './optimization/search.mjs';

const names = { canadian: 'Canadian Grand Prix', monaco: 'Monaco Grand Prix', barcelona: 'Barcelona Grand Prix',
  austrian: 'Austrian Grand Prix', british: 'British Grand Prix', belgian: 'Belgian Grand Prix',
  hungarian: 'Hungarian Grand Prix', dutch: 'Dutch Grand Prix', italian: 'Italian Grand Prix',
  singapore: 'Singapore Grand Prix' };
const methods = ['baseline', 'selected', 'firstBookMidpoint'];

/** A binary forecast score; endpoints are excluded rather than silently clipped. */
export function binaryScore(probability, outcome) {
  if (typeof probability !== 'number' || !Number.isFinite(probability) || probability <= 0 || probability >= 1 || ![0, 1].includes(outcome)) {
    throw new Error('A finite probability strictly inside (0,1) and binary outcome are required');
  }
  return { brier: (probability - outcome) ** 2,
    logLoss: -(outcome ? Math.log(probability) : Math.log1p(-probability)) };
}

/** Equal-weight each race after averaging its eligible contracts. */
export function scoreByRace(rows) {
  if (!Array.isArray(rows)) throw new Error('Forecast rows must be an array');
  const groups = new Map();
  for (const row of rows) {
    if (!row.race || !row.driver || !['training', 'validation', 'pseudo-holdout'].includes(row.split)) throw new Error('Missing race, driver or split');
    if (!groups.has(row.race)) groups.set(row.race, []);
    groups.get(row.race).push(row);
  }
  const races = [...groups].map(([race, group]) => {
    if (new Set(group.map((row) => row.split)).size !== 1) throw new Error('A race cannot occur in multiple splits');
    if (new Set(group.map((row) => row.driver)).size !== group.length) throw new Error('Duplicate driver within a race');
    const scores = Object.fromEntries(methods.map((method) => {
      const values = group.map((row) => binaryScore(row[method], row.outcome));
      return [method, { brier: values.reduce((sum, value) => sum + value.brier, 0) / values.length,
        logLoss: values.reduce((sum, value) => sum + value.logLoss, 0) / values.length }];
    }));
    return { race, split: group[0].split, markets: group.length, outcomesYes: group.reduce((sum, row) => sum + row.outcome, 0), scores };
  });
  const splits = Object.fromEntries(['training', 'validation', 'pseudo-holdout'].map((split) => {
    const group = races.filter((race) => race.split === split);
    if (!group.length) return [split, null];
    const scores = Object.fromEntries(methods.map((method) => [method, {
      brier: group.reduce((sum, race) => sum + race.scores[method].brier, 0) / group.length,
      logLoss: group.reduce((sum, race) => sum + race.scores[method].logLoss, 0) / group.length,
    }]));
    return [split, { races: group.length, markets: group.reduce((sum, race) => sum + race.markets, 0), scores,
      selectedMinusBaseline: { brier: scores.selected.brier - scores.baseline.brier, logLoss: scores.selected.logLoss - scores.baseline.logLoss },
      selectedMinusMidpoint: { brier: scores.selected.brier - scores.firstBookMidpoint.brier, logLoss: scores.selected.logLoss - scores.firstBookMidpoint.logLoss } }];
  }));
  return { races, splits };
}

/** Find the same first YES book used by the replay, rejecting future or invalid quotes. */
export function firstMidpoint(capture, market, firstAt, decisionTime, endTime) {
  const start = Date.parse(decisionTime), expected = Date.parse(firstAt), end = Date.parse(endTime);
  if (![start, expected, end].every(Number.isFinite) || expected < start || expected >= end) throw new Error('Snapshot is outside the pre-practice decision window');
  const candidates = capture.rows.filter((row) => row.condition === market.conditionId && row.asset === market.clobTokenIds[0] &&
    row.type === 'book' && !row.syntheticInactive && row.received >= start && row.received < end).sort((a, b) => a.received - b.received);
  const book = candidates[0];
  if (!book || new Date(book.received).toISOString() !== firstAt) throw new Error('First snapshot does not match optimizer eligibility');
  if (!Number.isFinite(book.source) || book.source > book.received) throw new Error('Snapshot source timestamp is invalid');
  const bids = JSON.parse(book.bids), asks = JSON.parse(book.asks);
  if (!Array.isArray(bids) || !Array.isArray(asks) || !bids.length || !asks.length) throw new Error('First snapshot is one-sided');
  const bid = Math.max(...bids.map(([price]) => Number(price))), ask = Math.min(...asks.map(([price]) => Number(price)));
  if (!(bid > 0 && ask < 1 && bid < ask)) throw new Error('First snapshot is crossed, locked or invalid');
  return { at: new Date(book.received).toISOString(), sourceAt: new Date(book.source).toISOString(), bid, ask, midpoint: (bid + ask) / 2 };
}

/** Preserve the optimizer's actual reason for disabling a market. */
export function inactiveReason(quality, driver) {
  const surname = driver.split(' ').at(-1).toLowerCase();
  const inactive = quality.inactiveMarkets.filter((item) => item.slug.includes(`winner-${surname}-`));
  if (inactive.length !== 1 || !inactive[0].reason) throw new Error(`Ambiguous inactive market ${driver}`);
  return `Inactive market: ${inactive[0].reason}`;
}

async function main() {
  if (process.argv.length !== 2) throw new Error('This diagnostic takes no arguments');
  const root = 'research/prediction-markets/pmdata';
  const normalized = process.env.PMDATA_NORMALIZED_DIRECTORY ?? 'tmp/pmdata-optimization-inactive';
  const read = async (file) => JSON.parse(await readFile(file, 'utf8'));
  const optimizer = await read(`${root}/optimization/results.json`);
  const features = [...(await read(`${root}/strategy-features-earlier.json`)).races, ...(await read(`${root}/strategy-features.json`)).races];
  const parameters = optimizer.search.selected?.parameters;
  if (!parameters) throw new Error('No model selected by the training search');
  const rows = [], excluded = [];
  for (const quality of optimizer.dataQuality) {
    if (!quality.included) { excluded.push({ race: quality.race, split: quality.split, reason: quality.reason }); continue; }
    const feature = features.find((race) => race.race === names[quality.race]);
    if (!feature || feature.historicalVintageVerified !== false) throw new Error('Missing feature provenance');
    const selected = adjustedProbabilities(feature.roster, parameters);
    const official = await read(`${root}/optimization/${quality.race}-official-outcomes.json`);
    const capture = await read(`${normalized}/${quality.race}-capture.json`);
    for (const { driver, at } of quality.firstSnapshots) {
      const surname = driver.split(' ').at(-1).toLowerCase();
      if (!at) {
        excluded.push({ race: quality.race, split: quality.split, driver, reason: inactiveReason(quality, driver) });
        continue;
      }
      const markets = official.markets.filter((market) => market.slug.includes(`winner-${surname}-`));
      const drivers = feature.roster.filter((item) => item.name === driver);
      if (markets.length !== 1 || drivers.length !== 1) throw new Error(`Ambiguous market or driver ${driver}`);
      const market = markets[0], outcome = Number(market.outcomePrices?.[0]);
      if (!market.closed || market.umaResolutionStatus !== 'resolved' || ![0, 1].includes(outcome)) throw new Error('Unsupported resolution');
      const end = new Date(Date.parse(feature.decisionTime) + 7200000).toISOString();
      let quote;
      try { quote = firstMidpoint(capture, market, at, feature.decisionTime, end); }
      catch (error) { excluded.push({ race: quality.race, split: quality.split, driver, reason: error.message }); continue; }
      const baseline = drivers[0].baselineProbability, adjusted = selected.get(driver);
      // Require finite log-loss for every method on the same set of markets.
      try { for (const p of [baseline, adjusted, quote.midpoint]) binaryScore(p, outcome); }
      catch (error) { excluded.push({ race: quality.race, split: quality.split, driver, reason: error.message }); continue; }
      rows.push({ race: quality.race, split: quality.split, driver, decisionTime: feature.decisionTime, ...quote,
        outcome, baseline, selected: adjusted, firstBookMidpoint: quote.midpoint });
    }
  }
  console.log(JSON.stringify({
    classification: 'Post-selection retrospective model diagnostic, not an untouched forecast test or trading P&L',
    assumptions: ['Candidate parameters were selected on the same training-race outcomes and later races had already been inspected.',
      'Race-level means weight each race equally; markets within a race are dependent and do not create independent trials.',
      'The market midpoint is the first two-sided recorded YES book for each contract; different contracts have different snapshot times.',
      'Midpoints need not be executable probabilities, complete, fresh or calibrated; the two sides can have a wide spread.',
      'Forecasts use current retrospective model/data vintages and the previous race roster, with no explicit Other probability.'],
    selectionParameters: parameters, matchedMarkets: rows, exclusions: excluded, ...scoreByRace(rows),
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
