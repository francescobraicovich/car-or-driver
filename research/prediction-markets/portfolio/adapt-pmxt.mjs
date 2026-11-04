/** Convert winner books to a conditional replay using recorded maker fills. */
export function adaptWinnerCapture({ capture, official, forecast, onchain, dataThrough, exitTime, resolution, initialCompleteSets = 5,
  driverSpecs = [['norris', 'Lando Norris'], ['hamilton', 'Lewis Hamilton']], allowRoundedVwap = false, raceStart }) {
  if (!capture || !Array.isArray(capture.rows) || !official || !Array.isArray(official.markets) ||
      !forecast || !Array.isArray(forecast.results) || forecast.results.length !== 1 || !Array.isArray(onchain)) {
    throw new Error('Capture, official identifiers, one forecast and maker records are required');
  }
  const source = forecast.results[0];
  if (typeof allowRoundedVwap !== 'boolean') throw new Error('Invalid rounded-VWAP opt-in');
  const asOf = Date.parse(source.decisionTime), firstPractice = Date.parse(source.firstPractice);
  if (raceStart !== undefined && (!Number.isFinite(raceStart) || raceStart <= firstPractice)) throw new Error('Invalid race start');
  const deadline = raceStart ?? firstPractice;
  if (!Number.isFinite(asOf) || !Number.isFinite(firstPractice) || !Number.isFinite(dataThrough) || dataThrough > asOf ||
      !Number.isFinite(exitTime) || exitTime < asOf || exitTime >= deadline) throw new Error('Invalid or future forecast and trading timestamps');
  if (!Array.isArray(driverSpecs) || driverSpecs.length === 0 || driverSpecs.some((spec) =>
    !Array.isArray(spec) || spec.length !== 2 || spec.some((part) => typeof part !== 'string' || !part))) {
    throw new Error('At least one driver slug and name are required');
  }
  if (new Set(driverSpecs.map(([slug]) => slug)).size !== driverSpecs.length ||
      new Set(driverSpecs.map(([, name]) => name)).size !== driverSpecs.length) {
    throw new Error('Driver slugs and names must be unique');
  }
  const marketData = driverSpecs.map(([slug, driver]) => {
    const matches = official.markets.filter((m) => m.slug.includes(`winner-${slug}-`));
    const roster = source.roster.filter((row) => row.name === driver);
    if (matches.length !== 1 || roster.length !== 1 || matches[0].outcomes?.join(',') !== 'Yes,No' || matches[0].clobTokenIds?.length !== 2) {
      throw new Error('Cannot uniquely identify a driver, YES/NO market and forecast');
    }
    const market = matches[0];
    const snapshots = capture.rows.filter((row) => row.condition === market.conditionId && row.asset === market.clobTokenIds[0] &&
      row.type === 'book' && row.received >= asOf && row.received <= exitTime).sort((a, b) => a.received - b.received);
    if (!snapshots.length) throw new Error('No YES snapshot in the selected trading window');
    return { id: market.conditionId, driver, officialMarket: market, yes: market.clobTokenIds[0], no: market.clobTokenIds[1], start: snapshots[0].received, initialSnapshot: snapshots[0],
      fairValue: { probability: roster[0].probability, asOf, dataThrough } };
  });
  if (!resolution || !['winner', 'other', 'void'].includes(resolution.type)) throw new Error('An explicit race resolution is required');
  for (const market of marketData) {
    const record = market.officialMarket;
    const yes = Number(record.outcomePrices?.[0]), no = Number(record.outcomePrices?.[1]);
    if (!record.closed || record.umaResolutionStatus !== 'resolved' || ![0, 0.5, 1].includes(yes) || yes + no !== 1) {
      throw new Error('Selected market lacks an explicit resolved payout in official metadata');
    }
    const expected = resolution.type === 'void' ? resolution.payouts?.[market.id]
      : resolution.type === 'winner' && resolution.driver === market.driver ? 1 : 0;
    if (yes !== expected) throw new Error('Race resolution conflicts with a selected market payout');
  }
  if (resolution.type === 'winner') {
    const actualWinner = official.markets.filter((m) => m.closed && m.umaResolutionStatus === 'resolved' && Number(m.outcomePrices?.[0]) === 1);
    const surname = typeof resolution.driver === 'string' ? resolution.driver.trim().toLowerCase().split(/\s+/).at(-1) : '';
    if (actualWinner.length !== 1 || !surname || !actualWinner[0].slug.includes(`winner-${surname}-`) ||
        resolution.winnerConditionId !== actualWinner[0].conditionId) {
      throw new Error('Race winner is not corroborated by the resolved winner market');
    }
  }
  if (resolution.type === 'other') {
    const actualWinner = official.markets.filter((m) => m.closed && m.umaResolutionStatus === 'resolved' && Number(m.outcomePrices?.[0]) === 1);
    if (actualWinner.length !== 1 || !actualWinner[0].slug.includes('winner-other-')) throw new Error('Other resolution is not corroborated by official metadata');
  }
  const byCondition = new Map(marketData.map((m) => [m.id, m]));
  const recordsByTransaction = new Map();
  for (const record of onchain) {
    if (![true, false].includes(record.takerIsExchange) || typeof record.transactionHash !== 'string') continue;
    const key = record.transactionHash.toLowerCase();
    const current = recordsByTransaction.get(key) || [];
    current.push(record);
    recordsByTransaction.set(key, current);
  }
  const events = [], seenTransactions = new Set(), droppedAtInitialTimestamp = {}, roundedVwapAssumptions = [];
  for (const row of capture.rows) {
    const market = byCondition.get(row.condition);
    if (!market || row.received < asOf || row.received > exitTime) continue;
    if (row.type === 'gap' || row.type === 'best_bid_ask') throw new Error('Capture contains a known or unreconciled data gap');
    if (row.type === 'tick_size_change') throw new Error('Tick size change requires a dynamic-tick replay');
    if (!['book', 'price_change', 'last_trade_price'].includes(row.type)) throw new Error('Unknown relevant capture event type');
    if (row.received < market.start) continue;
    // The initial snapshot and other events can share an unsequenced receipt
    // timestamp. Do not guess whether those events are inside the snapshot.
    if (row.received === market.start && row !== market.initialSnapshot) {
      droppedAtInitialTimestamp[row.type] = (droppedAtInitialTimestamp[row.type] || 0) + 1;
      continue;
    }
    if (row.receivedUs !== undefined && (!Number.isSafeInteger(row.receivedUs) || Math.abs(row.receivedUs / 1000 - row.received) > 0.001)) {
      throw new Error('Invalid microsecond receive timestamp');
    }
    if (row.sequence !== undefined && (typeof row.sequence !== 'string' || !/^\d+$/.test(row.sequence))) throw new Error('Invalid collector sequence');
    const common = { market: market.id, timestamp: row.received, sourceTimestamp: row.source,
      timestampUs: row.receivedUs ?? row.received * 1000, ...(row.sequence !== undefined ? { collectorSequence: row.sequence } : {}) };
    if (row.type === 'book' && row.asset === market.yes) {
      events.push({ ...common, type: 'snapshot', bids: JSON.parse(row.bids).map((level) => level.map(Number)), asks: JSON.parse(row.asks).map((level) => level.map(Number)) });
    } else if (row.type === 'price_change' && row.asset === market.yes) {
      events.push({ ...common, type: 'update', side: row.side?.toLowerCase(), price: Number(row.price), quantity: Number(row.size) });
    } else if (row.type === 'last_trade_price' && (row.asset === market.yes || row.asset === market.no)) {
      if (!['BUY', 'SELL'].includes(row.side)) throw new Error('Invalid exchange print side');
      if (typeof row.transactionHash !== 'string' || !row.transactionHash) throw new Error('A trade lacks its transaction identifier');
      const key = `${market.id}|${row.transactionHash.toLowerCase()}`;
      if (seenTransactions.has(key)) throw new Error('Duplicate trade transaction in a market requires manual reconciliation');
      seenTransactions.add(key);
      const records = (recordsByTransaction.get(row.transactionHash.toLowerCase()) || [])
        .filter((item) => item.tokenId === market.yes || item.tokenId === market.no);
      const makers = records.filter((item) => item.takerIsExchange === false).sort((a, b) => a.logIndex - b.logIndex);
      if (!makers.length) throw new Error('Trade lacks independently recorded maker levels');
      const reportedSide = row.asset === market.yes ? row.side : row.side === 'BUY' ? 'SELL' : 'BUY';
      const levels = new Map();
      let total = 0, totalQuantityUnits = 0, totalYesValueUnits = 0;
      for (const maker of makers) {
        if (![0, 1].includes(maker.side)) throw new Error('Unknown maker side');
        const rawQuantity = Number(maker.side === 0 ? maker.takerAmountFilled : maker.makerAmountFilled);
        const rawValue = Number(maker.side === 0 ? maker.makerAmountFilled : maker.takerAmountFilled);
        if (!Number.isSafeInteger(rawQuantity) || !Number.isSafeInteger(rawValue)) throw new Error('Maker fill exceeds safe integer precision');
        const makerQuantity = rawQuantity / 1e6;
        const value = rawValue / 1e6;
        if (!Number.isFinite(makerQuantity) || makerQuantity <= 0 || !Number.isFinite(value)) throw new Error('Invalid maker fill amounts');
        const makerPrice = value / makerQuantity;
        const isYes = maker.tokenId === market.yes;
        const side = (isYes ? maker.side === 0 : maker.side === 1) ? 'SELL' : 'BUY';
        if (side !== reportedSide) throw new Error('Maker direction conflicts with exchange print');
        const rawPrice = isYes ? makerPrice : 1 - makerPrice;
        const price = Math.round(rawPrice * 10000) / 10000;
        if (price <= 0 || price >= 1 || Math.abs(rawPrice - price) > 0.00001) throw new Error('Maker price cannot be resolved to four decimals');
        levels.set(price, (levels.get(price) || 0) + makerQuantity);
        total += makerQuantity;
        totalQuantityUnits += rawQuantity;
        totalYesValueUnits += isYes ? rawValue : rawQuantity - rawValue;
      }
      if (!Number.isFinite(Number(row.size)) || Math.abs(total - Number(row.size)) > 0.02) throw new Error('Maker sizes do not reconcile to exchange print');
      const rawPrintPrice = Number(row.price);
      const reportedPrice = row.asset === market.yes ? rawPrintPrice : 1 - rawPrintPrice;
      if (!Number.isFinite(reportedPrice) || reportedPrice <= 0 || reportedPrice >= 1) throw new Error('Invalid exchange print price');
      if (![...levels.keys()].some((price) => Math.abs(price - reportedPrice) < 0.00011)) {
        const summaries = records.filter((item) => item.takerIsExchange === true);
        let matched = false, weightedPrice = null;
        if (allowRoundedVwap && levels.size > 1 && summaries.length === 1 &&
            Number.isSafeInteger(totalQuantityUnits) && Number.isSafeInteger(totalYesValueUnits)) {
          const summary = summaries[0];
          const quantity = Number(summary.side === 0 ? summary.takerAmountFilled : summary.makerAmountFilled);
          const value = Number(summary.side === 0 ? summary.makerAmountFilled : summary.takerAmountFilled);
          const isYes = summary.tokenId === market.yes;
          const summarySide = (isYes ? summary.side === 0 : summary.side === 1) ? 'BUY' : 'SELL';
          const yesValue = isYes ? value : quantity - value;
          if ([0, 1].includes(summary.side) && Number.isSafeInteger(quantity) && Number.isSafeInteger(value) &&
              quantity === totalQuantityUnits && yesValue === totalYesValueUnits && summarySide === reportedSide) {
            weightedPrice = totalYesValueUnits / totalQuantityUnits;
            matched = Math.abs(Math.round(weightedPrice * 1000) / 1000 - reportedPrice) < 1e-7;
          }
        }
        if (!matched) throw new Error('Exchange print price does not match any reconciled maker price or verified summary');
        roundedVwapAssumptions.push({ condition: market.id, transactionHash: row.transactionHash, reportedPrice, weightedPrice });
      }
      for (const [price, quantity] of levels) events.push({ ...common, type: 'trade', side: reportedSide.toLowerCase(), price, quantity,
        transactionHash: row.transactionHash, eventId: `${row.transactionHash.toLowerCase()}|${reportedSide}|${price.toFixed(4)}` });
    }
  }
  events.sort((a, b) => {
    const timeDifference = a.timestampUs - b.timestampUs;
    if (timeDifference) return timeDifference;
    if (a.collectorSequence !== undefined && b.collectorSequence !== undefined) {
      const first = BigInt(a.collectorSequence), second = BigInt(b.collectorSequence);
      return first < second ? -1 : first > second ? 1 : 0;
    }
    return 0;
  });
  return { input: { race: source.race, firstPractice, ...(raceStart !== undefined ? { raceStart } : {}), exitTime, resolution,
    markets: marketData.map((m) => ({ id: m.id, driver: m.driver, initialCompleteSets, fairValue: m.fairValue,
      coverage: { complete: false, start: m.start, end: exitTime } })), events },
  provenance: { pmxt: capture.sources, historicalCoverageVerified: false, forecastDescription: forecast.description,
    forecastAsOfAssumed: source.decisionTime, dataThroughAssumed: dataThrough, historicalForecastVintageVerified: false,
    officialRetrieval: official.retrievedAt, officialResponseHash: official.originalResponseSha256, droppedAtInitialTimestamp,
    ...(allowRoundedVwap ? { roundedVwapAssumptions } : {}),
    warning: 'Retrospective roster-normalized forecast with no Other probability, unverified capture and maker-level timestamps inferred from trade prints; not a validated backtest.' } };
}
