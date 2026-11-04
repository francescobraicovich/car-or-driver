// Conditional weekend simulation; do not submit orders or treat these scores as calibrated probabilities.
import { readFile } from 'node:fs/promises';
import { adaptWinnerCapture } from '../../portfolio/adapt-pmxt.mjs';
import { replayPortfolio } from '../../portfolio/replay.mjs';
import { headProbabilities } from '../../weekend/signals.mjs';

const args = process.argv.slice(2);
if (!args.includes('--conditional-research') || args.some((flag) => !['--conditional-research', '--after-qualifying'].includes(flag)) ||
    new Set(args).size !== args.length) throw new Error('Supply --conditional-research and optionally --after-qualifying');
const afterQualifying = args.includes('--after-qualifying');
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const base = 'research/prediction-markets/pmdata';
const normalized = process.env.PMDATA_SESSION_NORMALIZED_DIRECTORY ??
  (afterQualifying ? 'tmp/pmdata-session-extended' : 'tmp/pmdata-session-normalized-v2');
const manifest = await read(`${base}/session-windows/manifest.json`);
const preparation = await read(`${normalized}/preparation.json`);
const signals = await read('research/prediction-markets/weekend/study-signals.json');
const fixed = { initialCapital: 3000, initialCompleteSets: 5, orderSize: 5, minimumOrderSize: 5, maxInventory: 10,
  tickSize: 0.01, latencyMs: 1000, cancelLatencyMs: 1000, maxBookAgeMs: 60000, maxSourceAgeMs: 120000,
  minimumEdgeTicks: 1, inventorySkewTicks: 0.1, quoteImprovementTicks: 1, marketMidpointWeight: 0,
  liquidationSlippageTicks: 1, allowUnverifiedData: true, allowSourceTimestampDisorder: true,
  tradeThroughFills: true };
const available = [], coverage = [];
for (const item of manifest.races) {
  const prepared = preparation.find((row) => row.race === item.id);
  const signal = signals.races.find((row) => row.race === item.name);
  if (!prepared || !signal) throw new Error(`Missing preparation or signal for ${item.id}`);
  if (afterQualifying && !prepared.qualifyingPost) throw new Error(`Missing post-qualifying capture preparation for ${item.id}`);
  const start = Date.parse(signal.preQualifying.asOf), post = Date.parse(signal.postQualifying.asOf);
  const qualifyingStart = Date.parse(signal.qualifyingStart), raceStart = Date.parse(signal.raceStart);
  const qualifyingPost = qualifyingStart + 3 * 3600000;
  const nextDay = Date.parse(`${item.dates[1]}T00:00:00Z`);
  const firstPractice = Date.parse(prepared.firstPractice), exitTime = raceStart - 60000;
  if (![start, post, qualifyingStart, raceStart, firstPractice].every(Number.isFinite) ||
      start >= qualifyingStart || qualifyingStart >= post || post >= exitTime || firstPractice >= qualifyingStart ||
      raceStart !== Date.parse(prepared.raceStart)) throw new Error(`Invalid session times for ${item.id}`);
  const previousOfficial = await read(`${base}/optimization/${item.id}-official-outcomes.json`);
  // The earlier four-driver extract is not the whole event. The session
  // manifest retains the official Gamma metadata for every mapped driver.
  const officialMarkets = new Map(previousOfficial.markets.map((market) => [market.conditionId, market]));
  for (const driver of item.drivers) if (driver.market) officialMarkets.set(driver.market.conditionId, driver.market);
  const official = { ...previousOfficial, markets: [...officialMarkets.values()] };
  const winners = official.markets.filter((market) => Number(market.outcomePrices?.[0]) === 1);
  if (winners.length !== 1) throw new Error(`No unique resolved winner for ${item.id}`);
  const winningDriver = item.drivers.find((driver) => driver.market?.conditionId === winners[0].conditionId);
  const fallback = winners[0].slug.match(/winner-(.+?)-\d{4}-\d{2}-\d{2}$/)?.[1];
  const resolution = { type: 'winner', driver: winningDriver?.name ?? fallback, winnerConditionId: winners[0].conditionId };
  const prior = new Map(signal.preQualifying.roster.map((driver) => [driver.driverId, driver]));
  const later = new Map(signal.postQualifying.roster.map((driver) => [driver.driverId, driver]));
  const fullPre = new Map(headProbabilities(signal.preQualifying.roster, true).map((row) => [row.driverId, row.probability]));
  const fullPost = new Map(headProbabilities(signal.postQualifying.roster, true).map((row) => [row.driverId, row.probability]));
  const forecast = { description: 'Prior-prefix projected pairwise head; not a calibrated winner probability', results: [{
    race: item.name, decisionTime: signal.preQualifying.asOf, firstPractice: prepared.firstPractice,
    roster: signal.preQualifying.roster.map((driver) => ({ ...driver, probability: fullPre.get(driver.driverId) })) }] };
  const markets = [], events = [], through = {}, detail = { race: item.id, requestedDrivers: item.drivers.length, drivers: [] };
  const throughMidnight = {};
  for (const driver of item.drivers) {
    const first = prepared.days[0].drivers.find((row) => row.driverId === driver.driverId);
    const second = prepared.days[1].drivers.find((row) => row.driverId === driver.driverId);
    const after = afterQualifying ? prepared.qualifyingPost?.drivers.find((row) => row.driverId === driver.driverId) : null;
    if (!driver.market || !prior.has(driver.driverId) || !later.has(driver.driverId) ||
        (second?.status !== 'prepared' && (!afterQualifying || after?.status !== 'prepared'))) {
      detail.drivers.push({ driver: driver.name, active: false,
        reason: !driver.market ? 'No identified market' : !later.has(driver.driverId) ? 'No matching post-qualifying roster/team' : second?.reason ?? 'Session capture unavailable' });
      continue;
    }
    try {
      const secondCapture = second?.status === 'prepared' ? await read(second.capture) : { rows: [], sources: [] };
      const secondChain = second?.status === 'prepared' ? await read(second.fills) : [];
      const useFirst = first?.status === 'prepared' && (!afterQualifying || after?.status === 'prepared');
      const firstCapture = useFirst ? await read(first.capture) : { rows: [], sources: [] };
      const firstChain = useFirst ? await read(first.fills) : [];
      const middleCapture = after?.status === 'prepared' ? await read(after.capture) : { rows: [], sources: [] };
      const middleChain = after?.status === 'prepared' ? await read(after.fills) : [];
      // Quotes are stopped during qualifying and until the later forecast.
      // Ignore Sunday books before that forecast; the engine must see a new snapshot after it.
      const laterRows = secondCapture.rows.filter((row) => row.received >= post && row.received <= exitTime);
      const capture = { sources: [...firstCapture.sources, ...middleCapture.sources, ...secondCapture.sources],
        rows: [...firstCapture.rows, ...middleCapture.rows, ...laterRows] };
      const slug = driver.market.slug.match(/winner-(.+?)-\d{4}-\d{2}-\d{2}$/)?.[1];
      if (!slug) throw new Error('Unrecognized market slug');
      // Repeated qualifying-day captures share one decoded on-chain file.
      const chain = [...firstChain, ...middleChain, ...secondChain];
      const uniqueChain = [...new Map(chain.map((record) => [`${record.transactionHash.toLowerCase()}|${record.logIndex}`, record])).values()];
      const adapted = adaptWinnerCapture({ capture, official, forecast, onchain: uniqueChain,
        dataThrough: start, exitTime, raceStart, resolution, driverSpecs: [[slug, driver.name]], allowRoundedVwap: true });
      const market = adapted.input.markets[0];
      if (adapted.input.events.some((event) => event.type === 'trade' && event.timestamp - event.sourceTimestamp > 1000)) {
        throw new Error('Recorded trade lag exceeds the one-second cancellation latency');
      }
      const sundayBooks = adapted.input.events.filter((event) => event.timestamp >= post && event.type === 'snapshot');
      if (!afterQualifying && !sundayBooks.length) throw new Error('No real post-forecast book snapshot');
      const attested = useFirst && market.coverage.start < qualifyingStart - fixed.latencyMs - fixed.cancelLatencyMs;
      const localBlackouts = [{ start: qualifyingStart, end: afterQualifying ? qualifyingPost : post,
        observedThrough: attested ? { [market.id]: qualifyingStart } : {} }];
      if (afterQualifying) localBlackouts.push({ start: nextDay, end: post,
        observedThrough: after?.status === 'prepared' ? { [market.id]: nextDay } : {} });
      const forecastTimes = afterQualifying ? [qualifyingPost, post] : [post];
      const localForecasts = forecastTimes.map((timestamp) => ({ type: 'forecast', timestamp,
        dataThrough: afterQualifying ? qualifyingPost : timestamp,
        probabilities: { [market.id]: fullPost.get(driver.driverId) } }));
      const localEvents = [...adapted.input.events, ...localForecasts].sort((a, b) => a.timestamp - b.timestamp || (a.type === 'forecast' ? -1 : b.type === 'forecast' ? 1 : 0));
      replayPortfolio({ ...adapted.input, events: localEvents, blackouts: localBlackouts }, { ...fixed,
        exitMode: 'liquidation', liquidationStartTime: raceStart - 1800000,
        minimumEdgeTicks: 100, quoteImprovementTicks: 0, takerFeeRate: raceStart < Date.parse('2026-07-10T00:00:00Z') ? 0.03 : 0.05 });
      markets.push(market); events.push(...adapted.input.events);
      if (attested) through[market.id] = qualifyingStart;
      if (after?.status === 'prepared') throughMidnight[market.id] = nextDay;
      detail.drivers.push({ driver: driver.name, active: true, qualifyingCapture: attested,
        afterQualifyingCapture: after?.status === 'prepared', raceDayCapture: second?.status === 'prepared',
        firstSnapshot: market.coverage.start, firstRaceDaySnapshot: sundayBooks[0]?.timestamp ?? null,
        roundedVwapAssumptions: adapted.provenance.roundedVwapAssumptions.length });
    } catch (error) { detail.drivers.push({ driver: driver.name, active: false, reason: error.message }); }
  }
  detail.activeDrivers = markets.length;
  detail.qualifyingCaptures = detail.drivers.filter((row) => row.active && row.qualifyingCapture).length;
  detail.afterQualifyingCaptures = detail.drivers.filter((row) => row.active && row.afterQualifyingCapture).length;
  detail.raceDayCaptures = detail.drivers.filter((row) => row.active && row.raceDayCapture).length;
  coverage.push(detail);
  if (markets.length) available.push({ id: item.id, name: item.name, signal, firstPractice, raceStart, post, qualifyingStart, exitTime,
    qualifyingPost, nextDay, markets, events, through, throughMidnight, resolution, official });
}

function runRace(entry, capital, { withForm, hold, margin = 0.02, tradeThroughFills = true, midpointWeight = 0,
  holdingReference = 'entry', forcedCarry = true, latencyMs = 1000, cancelLatencyMs = 1000 }) {
  const pre = new Map(headProbabilities(entry.signal.preQualifying.roster, withForm).map((row) => [row.driverId, row.probability]));
  const post = new Map(headProbabilities(entry.signal.postQualifying.roster, withForm).map((row) => [row.driverId, row.probability]));
  const byName = new Map(entry.signal.preQualifying.roster.map((row) => [row.name, row.driverId]));
  const probabilities = Object.fromEntries(entry.markets.map((market) => [market.id, post.get(byName.get(market.driver))]));
  const markets = entry.markets.map((market) => ({ ...market, fairValue: { ...market.fairValue,
    probability: pre.get(byName.get(market.driver)) } }));
  const forecastTimes = afterQualifying ? [entry.qualifyingPost, entry.post] : [entry.post];
  const forecasts = forecastTimes.map((timestamp) => ({ type: 'forecast', timestamp,
    dataThrough: afterQualifying ? entry.qualifyingPost : timestamp, probabilities }));
  const events = [...entry.events, ...forecasts].sort((a, b) => a.timestamp - b.timestamp || (a.type === 'forecast' ? -1 : b.type === 'forecast' ? 1 : 0));
  const blackouts = [{ start: entry.qualifyingStart, end: afterQualifying ? entry.qualifyingPost : entry.post, observedThrough: entry.through }];
  if (afterQualifying) blackouts.push({ start: entry.nextDay, end: entry.post, observedThrough: entry.throughMidnight });
  return replayPortfolio({ race: entry.name, firstPractice: entry.firstPractice, raceStart: entry.raceStart,
    exitTime: entry.exitTime, resolution: entry.resolution, markets, events,
    blackouts },
  { ...fixed, initialCapital: capital, exitMode: hold ? 'conditionalSettlement' : 'liquidation',
    liquidationStartTime: entry.raceStart - 1800000, holdingRiskMargin: margin, holdingReference,
    allowForcedCarry: hold && holdingReference === 'entry' && forcedCarry,
    marketMidpointWeight: midpointWeight, tradeThroughFills, latencyMs, cancelLatencyMs,
    takerFeeRate: entry.raceStart < Date.parse('2026-07-10T00:00:00Z') ? 0.03 : 0.05 });
}

function summarize(result) {
  const maker = result.fills.filter((fill) => fill.kind === 'maker');
  const closing = result.fills.filter((fill) => fill.kind === 'liquidation');
  const held = result.markets.filter((market) => Math.abs(market.inventory) > 1e-9);
  return { race: result.race, complete: result.complete, profit: result.profit, initialCapital: result.initialCapital,
    makerFills: maker.length, makerShares: maker.reduce((sum, fill) => sum + fill.quantity, 0),
    inferredTradeThroughFills: maker.filter((fill) => fill.tradeThrough).length,
    closingFills: closing.length, fees: result.fees,
    liquidationSlippage: closing.reduce((sum, fill) => sum + fill.slippageCost, 0),
    peakCapitalCommitted: result.peakCapitalCommitted, heldPositions: held.map(({ driver, inventory, holdDecision }) => ({ driver, inventory, holdDecision })),
    outcomeScenarios: result.outcomeScenarios, forcedCarries: result.forcedCarries, sourceTimestampReversals: result.sourceTimestampReversals,
    holdingDecisions: result.holdingDecisions, fills: result.fills };
}

function evaluate(settings) {
  let capital = 3000, previousSettlement = -Infinity;
  const races = [];
  for (const entry of available) {
    const closeTime = Date.parse(entry.official.markets.find((market) => market.conditionId === entry.resolution.winnerConditionId)?.closedTime);
    if (!Number.isFinite(closeTime) || Date.parse(entry.signal.preQualifying.asOf) <= previousSettlement) {
      return { available: false, reason: 'Resolution timing cannot establish shared-cash availability', races };
    }
    try {
      const result = runRace(entry, capital, settings);
      races.push(summarize(result));
      if (!result.complete || !Number.isFinite(result.profit)) return { available: false, reason: `Incomplete decision or exit in ${entry.id}`, races };
      capital += result.profit;
      if (capital <= 0) return { available: false, reason: 'Capital exhausted', races };
      previousSettlement = closeTime;
    } catch (error) { return { available: false, reason: error.message, races }; }
  }
  if (available.length !== manifest.races.length) return { available: false, reason: 'One or more requested races have no eligible markets', races };
  return { available: true, initialCapital: 3000, finalCapital: capital, profit: capital - 3000, races };
}

const report = { classification: 'Conditional retrospective simulation; feed, historical forecast vintages and fills are not verified',
  assumptions: { ...fixed, timings: afterQualifying
    ? 'Quote until qualifying start, resume three hours after scheduled qualifying after a fresh book, pause at UTC midnight, resume at race start minus 3h after a fresh snapshot, and stop quoting 30 minutes before the race.'
    : 'Quote on qualifying day until the scheduled start, cancel during qualifying, resume at race start minus 3h after a fresh snapshot, stop quoting 30 minutes before race, and complete decisions by one minute before start.',
    holding: 'At wind-down, retain a net position if its model forecast advantage over its weighted average entry price exceeds the specified per-share margin. Otherwise attempt to close; residual positions with insufficient displayed liquidity are explicitly forced to settle. This entry-price rule does not compare the position with the current market opportunity; settlement depends on the winner.',
    sourceSelection: afterQualifying
      ? 'Pre-qualifying tape is used only when a qualifying-post capture and matching post-qualifying roster entry exist; a market can enter with qualifying-post data alone or race-day data alone. These retrospective completeness and roster rules are not ex-ante selection rules.'
      : 'A market enters the pre-qualifying replay only if later race-day data and a matching post-qualifying roster entry exist; this retrospective complete-case rule is not an ex-ante tradable coverage or roster rule.',
    model: 'Projected pairwise finishing-order forecasts are not calibrated winner probabilities; qualifying positions proxy the grid and historical publication/revision times are unverified.',
    qualifyingPublication: afterQualifying ? 'F1 qualifying reports were published before the three-hour restart in both races; exact historical availability and revisions of all qualifying inputs remain unverified. This extended window was added after inspecting earlier results.' : 'Results are assumed available at race start minus three hours; exact historical availability is unverified.',
    clock: 'For source timestamps leading receipt by at most 5ms, effective receipt is delayed to the source timestamp and events are reordered; larger leads are rejected. Actual collector and venue clock synchronization is not verified.',
    delayedPrints: 'Markets with recorded trade receipt more than one second after source time are excluded. Smaller delays may still overlap cancellations; historical fills and acknowledgment timing remain unverified.',
    weekendInformation: 'Pre-qualifying probabilities use previous races only; practice and any current-weekend sprint are not model inputs.',
    fees: '0.03 taker fee coefficient before 10 July 2026 and 0.05 afterward, with zero maker fee; contract-specific fees and gas are unverified.',
    outcomes: 'Recorded resolution is used for realized settlement and a metadata integrity check only. One winning driver per event; Other and uniform-half void scenarios are included.' },
  coverage, forecastAccuracy: signals.summary,
  fullFormHold: evaluate({ withForm: true, hold: true }),
  noFormHold: evaluate({ withForm: false, hold: true }),
  fullFormClose: evaluate({ withForm: true, hold: false }),
  fullFormHoldStrict: evaluate({ withForm: true, hold: true, forcedCarry: false }),
  fullFormHoldExecutable: evaluate({ withForm: true, hold: true, holdingReference: 'executable' }),
  fullFormHoldSamePriceOnly: evaluate({ withForm: true, hold: true, tradeThroughFills: false }),
  fullFormHoldSlow: evaluate({ withForm: true, hold: true, latencyMs: 3000, cancelLatencyMs: 3000 }),
  fullFormHoldHigherMargin: evaluate({ withForm: true, hold: true, margin: 0.05 }),
  blendedQuotesWithFormHold: evaluate({ withForm: true, hold: true, midpointWeight: 0.5 }),
  blendedQuotesSamePriceOnly: evaluate({ withForm: true, hold: true, midpointWeight: 0.5, tradeThroughFills: false }),
  midpointQuotesWithFormHold: evaluate({ withForm: true, hold: true, midpointWeight: 1 }),
  midpointQuotesSamePriceOnly: evaluate({ withForm: true, hold: true, midpointWeight: 1, tradeThroughFills: false }) };
console.log(JSON.stringify(report, null, 2));
