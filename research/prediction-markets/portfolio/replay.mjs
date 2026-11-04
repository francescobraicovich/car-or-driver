/** Shared-collateral replay of a subset of mutually exclusive race-winner contracts. */
export function replayPortfolio(input, options = {}) {
  const {
    initialCapital = 100, orderSize = 5, minimumOrderSize = 1, maxInventory = 10, tickSize = 0.01,
    latencyMs = 1000, cancelLatencyMs = 0, maxBookAgeMs = 60000, maxSourceAgeMs = maxBookAgeMs,
    minimumEdgeTicks = 1, inventorySkewTicks = 0.1, takerFeeRate = 0,
    liquidationSlippageTicks = 1, exitMode = 'settlement', allowUnverifiedData = false,
    allowSourceTimestampDisorder = false, quoteImprovementTicks = 0, tradeThroughFills = false,
    liquidationStartTime = null, marketMidpointWeight = 0, holdingRiskMargin = 0, holdingReference = 'executable', allowForcedCarry = false,
  } = options;
  const number = (x) => typeof x === 'number' && Number.isFinite(x);
  const requireNumber = (x, label, min, max = Infinity) => {
    if (!number(x) || x < min || x > max) throw new Error(`Invalid ${label}`);
  };
  for (const [value, label, min, max] of [
    [initialCapital, 'initialCapital', 0], [orderSize, 'orderSize', 0.000001], [minimumOrderSize, 'minimumOrderSize', 0.000001],
    [maxInventory, 'maxInventory', 0.000001], [tickSize, 'tickSize', 0.000001, 0.5],
    [latencyMs, 'latencyMs', 0], [cancelLatencyMs, 'cancelLatencyMs', 0], [maxBookAgeMs, 'maxBookAgeMs', 1],
    [maxSourceAgeMs, 'maxSourceAgeMs', 1], [minimumEdgeTicks, 'minimumEdgeTicks', 0],
    [inventorySkewTicks, 'inventorySkewTicks', 0], [takerFeeRate, 'takerFeeRate', 0, 1],
    [liquidationSlippageTicks, 'liquidationSlippageTicks', 0], [quoteImprovementTicks, 'quoteImprovementTicks', 0],
    [marketMidpointWeight, 'marketMidpointWeight', 0, 1],
    [holdingRiskMargin, 'holdingRiskMargin', 0, 1],
  ]) requireNumber(value, label, min, max);
  if (!Object.hasOwn(options, 'tickSize')) throw new Error('Historical tickSize must be supplied explicitly');
  if (!Object.hasOwn(options, 'minimumOrderSize') || minimumOrderSize > orderSize) throw new Error('Historical minimumOrderSize must be supplied explicitly and not exceed orderSize');
  if (!Number.isInteger(minimumEdgeTicks) || !['settlement', 'liquidation', 'conditionalSettlement'].includes(exitMode)) throw new Error('Invalid strategy options');
  if (!Number.isInteger(quoteImprovementTicks) || typeof tradeThroughFills !== 'boolean') throw new Error('Invalid execution options');
  if (!['executable', 'entry'].includes(holdingReference)) throw new Error('Invalid holdingReference');
  if (typeof allowForcedCarry !== 'boolean' || (allowForcedCarry && (exitMode !== 'conditionalSettlement' || holdingReference !== 'entry'))) {
    throw new Error('Forced carry requires conditional settlement with entry-basis holding');
  }
  if (exitMode !== 'settlement' && !Object.hasOwn(options, 'takerFeeRate')) throw new Error('Liquidation requires an explicit historical takerFeeRate');
  if (typeof allowUnverifiedData !== 'boolean') throw new Error('Invalid allowUnverifiedData');
  if (typeof allowSourceTimestampDisorder !== 'boolean' || (allowSourceTimestampDisorder && !allowUnverifiedData)) {
    throw new Error('Source timestamp disorder requires explicit conditional sensitivity opt-in');
  }
  if (!input || typeof input.race !== 'string' || !input.race || !Array.isArray(input.markets) || !input.markets.length || !Array.isArray(input.events)) {
    throw new Error('A race, markets and events are required');
  }
  requireNumber(input.firstPractice, 'firstPractice', 0);
  requireNumber(input.exitTime, 'exitTime', 0);
  if (input.raceStart === undefined) {
    if (input.exitTime >= input.firstPractice) throw new Error('exitTime must precede first practice');
  } else {
    requireNumber(input.raceStart, 'raceStart', 0);
    if (input.raceStart <= input.firstPractice || input.exitTime >= input.raceStart) throw new Error('exitTime must precede race start');
  }
  if (liquidationStartTime !== null) {
    requireNumber(liquidationStartTime, 'liquidationStartTime', 0);
    if (exitMode === 'settlement' || liquidationStartTime >= input.exitTime) throw new Error('Invalid liquidationStartTime');
  }
  if (exitMode === 'conditionalSettlement' && (input.raceStart === undefined || liquidationStartTime === null || !Object.hasOwn(options, 'holdingRiskMargin'))) {
    throw new Error('Conditional settlement requires raceStart, liquidationStartTime and an explicit holdingRiskMargin');
  }
  if (input.blackouts !== undefined && !Array.isArray(input.blackouts)) throw new Error('Blackouts must be an array');
  const blackouts = (input.blackouts || []).map((interval) => {
    if (!interval || !number(interval.start) || !number(interval.end) ||
        (!number(interval.observedThrough) && (!interval.observedThrough || typeof interval.observedThrough !== 'object' || Array.isArray(interval.observedThrough))) ||
        interval.start < latencyMs + cancelLatencyMs || interval.start >= interval.end || interval.end > input.exitTime) {
      throw new Error('Blackout requires a valid interval and observed cancellation tape');
    }
    return { ...interval, stop: interval.start - latencyMs - cancelLatencyMs, cancellationScheduled: false, reset: false };
  });
  for (let i = 1; i < blackouts.length; i++) {
    if (blackouts[i].stop < blackouts[i - 1].end) throw new Error('Blackouts and their cancellation windows must not overlap');
  }
  if (exitMode === 'conditionalSettlement' && blackouts.some((interval) => interval.end > liquidationStartTime)) {
    throw new Error('Holding decisions must start after every blackout');
  }
  if (exitMode !== 'liquidation') {
    if (!['winner', 'other', 'void'].includes(input.resolution?.type) ||
        (input.resolution.type === 'winner' && (typeof input.resolution.driver !== 'string' || !input.resolution.driver))) {
      throw new Error('One race resolution is required');
    }
  }
  const states = new Map();
  const drivers = new Set();
  let cash = initialCapital;
  let allCoverageVerified = true;
  for (const market of input.markets) {
    if (typeof market.id !== 'string' || !market.id || states.has(market.id) ||
        typeof market.driver !== 'string' || !market.driver || drivers.has(market.driver)) throw new Error('Duplicate or invalid market or driver');
    requireNumber(market.initialCompleteSets, 'initialCompleteSets', 0);
    requireNumber(market.fairValue?.probability, 'fair value probability', 0, 1);
    requireNumber(market.fairValue?.asOf, 'fair value asOf', 0);
    requireNumber(market.fairValue?.dataThrough, 'fair value dataThrough', 0);
    if (market.fairValue.dataThrough > market.fairValue.asOf || market.fairValue.asOf > input.exitTime) throw new Error('Fair value has future inputs or is available after exit');
    if (!market.coverage || !number(market.coverage.start) || !number(market.coverage.end) || market.coverage.start > market.coverage.end || market.coverage.end < input.exitTime) {
      throw new Error('Market coverage must span exitTime');
    }
    if (market.coverage.complete !== true) {
      allCoverageVerified = false;
      if (!allowUnverifiedData) throw new Error('Verified coverage is required; conditional sensitivity requires explicit opt-in');
    }
    cash -= market.initialCompleteSets;
    states.set(market.id, { market, fairValue: { ...market.fairValue }, yes: market.initialCompleteSets, no: market.initialCompleteSets, inventory: 0, inventoryBasis: 0,
      book: { buy: new Map(), sell: new Map() }, uncertain: { buy: new Set(), sell: new Set() },
      active: { buy: null, sell: null }, pending: { buy: null, sell: null },
      version: { buy: 0, sell: 0 }, lastFillVersion: { buy: -1, sell: -1 }, lastBook: null, sourceTime: -1,
      firstEvent: null, everHadSnapshot: false, waitingForSnapshot: false, forecastRequiredAfter: 0,
      seenTradeEvents: new Set(), crossedSince: null, holdDecision: null, holdValid: false });
    drivers.add(market.driver);
  }
  if (exitMode !== 'liquidation' && input.resolution.type === 'void') {
    const payouts = input.resolution.payouts;
    if (!payouts || typeof payouts !== 'object' || Array.isArray(payouts) ||
        Object.keys(payouts).length !== states.size || [...states.keys()].some((id) => ![0, 0.5, 1].includes(payouts[id]))) {
      throw new Error('Void requires an explicit verified payout for each market');
    }
  }
  if (cash < -1e-9) throw new Error('Initial complete sets exceed initial capital');
  for (const interval of blackouts) for (const [id, s] of states) {
    if (s.market.coverage.start >= interval.stop) continue;
    const through = number(interval.observedThrough) ? interval.observedThrough : interval.observedThrough[id];
    if (!number(through) || through < interval.start) throw new Error('Blackout requires observed cancellation tape for every earlier market');
  }
  if (input.markets.reduce((sum, market) => sum + market.fairValue.probability, 0) > 1 + 1e-9) {
    throw new Error('Race-winner probabilities cannot sum to more than one');
  }
  const validPrice = (p) => number(p) && p > 0 && p < 1;
  const best = (s, side) => {
    const levels = [...s.book[side].keys()];
    return levels.length ? (side === 'buy' ? Math.max(...levels) : Math.min(...levels)) : null;
  };
  const usable = (s, t) => {
    const bid = best(s, 'buy'), ask = best(s, 'sell');
    return s.lastBook !== null && t - s.lastBook <= maxBookAgeMs && bid !== null && ask !== null && bid < ask;
  };
  const reservedCash = () => [...states.values()].reduce((sum, s) => sum + (s.active.buy?.remaining ?? 0) * (s.active.buy?.price ?? 0) +
    (s.pending.buy?.remaining ?? 0) * (s.pending.buy?.price ?? 0), 0);
  let peakCapitalCommitted = initialCapital - cash, peakReservedCash = 0;
  const recordCapital = () => {
    const reserved = reservedCash();
    peakReservedCash = Math.max(peakReservedCash, reserved);
    peakCapitalCommitted = Math.max(peakCapitalCommitted, initialCapital - cash + reserved);
  };
  const cancel = (s, side, t) => {
    if (cancelLatencyMs === 0) { s.active[side] = null; s.pending[side] = null; return; }
    for (const order of [s.active[side], s.pending[side]]) {
      if (order && order.cancelAt === undefined) {
        // A cancellation of an order still in flight is modeled only after
        // its arrival, so it cannot incorrectly eliminate the exposure.
        order.cancelAt = Math.max(t, order.activateAt) + cancelLatencyMs;
      }
    }
  };
  const expireCancellations = (s, t) => {
    for (const side of ['buy', 'sell']) {
      if (s.active[side]?.cancelAt <= t) s.active[side] = null;
      if (s.pending[side]?.cancelAt <= t) s.pending[side] = null;
    }
  };
  const setLevel = (s, side, price, quantity) => {
    if (!['buy', 'sell'].includes(side) || !validPrice(price) || !number(quantity) || quantity < 0) throw new Error('Invalid book level');
    if (quantity === 0) s.book[side].delete(price); else s.book[side].set(price, quantity);
  };
  const applyInventoryFill = (s, side, quantity, price) => {
    const sign = side === 'buy' ? 1 : -1;
    const old = s.inventory;
    if (old === 0 || Math.sign(old) === sign) s.inventoryBasis += quantity * price;
    else {
      const reduced = Math.min(Math.abs(old), quantity);
      s.inventoryBasis *= (Math.abs(old) - reduced) / Math.abs(old);
      s.inventoryBasis += (quantity - reduced) * price;
    }
    s.yes += sign * quantity;
    s.inventory += sign * quantity;
    if (Math.abs(s.inventory) < 1e-9) { s.inventory = 0; s.inventoryBasis = 0; }
  };
  const activate = (s, t) => {
    for (const side of ['buy', 'sell']) {
      const order = s.pending[side];
      if (!order || order.activateAt > t) continue;
      s.pending[side] = null;
      const opposite = best(s, side === 'buy' ? 'sell' : 'buy');
      if ((cancelLatencyMs === 0 && !usable(s, t)) ||
          (opposite !== null && (side === 'buy' ? order.price >= opposite : order.price <= opposite))) continue;
      // A decimal price such as 0.70 and 70 * 0.01 can have different
      // binary representations; both identify the same displayed level.
      const ahead = [...s.book[side]].reduce((sum, [price, depth]) =>
        sum + (Math.abs(price - order.price) < 1e-9 ? depth : 0), 0);
      s.active[side] = { ...order, ahead };
    }
  };
  const quote = (s, t) => {
    if (!usable(s, t) || t < s.fairValue.asOf || s.fairValue.asOf < s.forecastRequiredAfter) {
      cancel(s, 'buy', t); cancel(s, 'sell', t); return;
    }
    const shift = Math.round(s.inventory * inventorySkewTicks) * tickSize;
    // A market midpoint is observable only after the current book event; no
    // later book or race outcome enters this per-market execution anchor.
    const fairValue = (1 - marketMidpointWeight) * s.fairValue.probability +
      marketMidpointWeight * (best(s, 'buy') + best(s, 'sell')) / 2;
    for (const side of ['buy', 'sell']) {
      const edge = minimumEdgeTicks * tickSize;
      const fair = fairValue + (side === 'buy' ? -edge : edge);
      const fairTicks = side === 'buy' ? Math.floor(fair / tickSize + 1e-9) : Math.ceil(fair / tickSize - 1e-9);
      const raw = best(s, side) + (side === 'buy' ? 1 : -1) * quoteImprovementTicks * tickSize - shift;
      let priceTicks = Math.round((side === 'buy' ? Math.min(raw, fairTicks * tickSize) : Math.max(raw, fairTicks * tickSize)) / tickSize);
      const opposite = side === 'buy' ? 'sell' : 'buy';
      const ownOpposite = s.active[opposite] || s.pending[opposite];
      if (quoteImprovementTicks > 0) {
        // Improved quotes must remain post-only on the external book.
        const oppositeBest = best(s, opposite);
        const externalBound = side === 'buy' ? Math.ceil(oppositeBest / tickSize - 1e-9) - 1 : Math.floor(oppositeBest / tickSize + 1e-9) + 1;
        priceTicks = side === 'buy' ? Math.min(priceTicks, externalBound) : Math.max(priceTicks, externalBound);
      }
      // An opposing order remains live while its cancellation is in flight,
      // even when the recorded market or the fair value has moved past it.
      if (ownOpposite) {
        const ownTicks = Math.round(ownOpposite.price / tickSize);
        priceTicks = side === 'buy' ? Math.min(priceTicks, ownTicks - 1) : Math.max(priceTicks, ownTicks + 1);
      }
      const price = priceTicks * tickSize;
      const limit = side === 'buy' ? maxInventory - s.inventory : maxInventory + s.inventory;
      const maximum = Math.min(orderSize, Math.max(0, limit), side === 'sell' ? s.yes : Infinity);
      const safe = validPrice(price) && maximum > 1e-9 && (side === 'buy' ? price < best(s, 'sell') : price > best(s, 'buy'));
      const current = s.active[side] || s.pending[side];
      if (!safe || (current && (Math.abs(current.price - price) > 1e-9 || current.remaining > maximum + 1e-9))) cancel(s, side, t);
      if (safe && !s.active[side] && !s.pending[side] && s.version[side] > s.lastFillVersion[side]) {
        const available = side === 'buy' ? Math.max(0, cash - reservedCash()) / price : maximum;
        const remaining = Math.min(maximum, available);
        if (remaining + 1e-9 >= minimumOrderSize) s.pending[side] = { price, remaining, activateAt: t + latencyMs };
      }
    }
    activate(s, t);
  };
  // Stop submitting before exit so that pending arrivals and their delayed
  // cancellations have time to resolve before liquidation or settlement.
  const quoteStopTime = liquidationStartTime ?? input.exitTime - latencyMs - cancelLatencyMs;
  let exitCancellationScheduled = false;
  const prepareTime = (t) => {
    for (const interval of blackouts) {
      if (t >= interval.stop && !interval.cancellationScheduled) {
        for (const s of states.values()) for (const side of ['buy', 'sell']) cancel(s, side, interval.stop);
        interval.cancellationScheduled = true;
      }
      if (t >= interval.start && !interval.reset) {
        for (const s of states.values()) {
          expireCancellations(s, interval.start);
          if (s.active.buy || s.active.sell || s.pending.buy || s.pending.sell) throw new Error('Orders remain live at blackout start');
          for (const side of ['buy', 'sell']) { s.book[side].clear(); s.uncertain[side].clear(); }
          if (s.crossedSince !== null) crossedBookIntervals.push({ market: s.market.id, start: s.crossedSince,
            end: interval.start, durationMs: interval.start - s.crossedSince });
          s.crossedSince = null; s.lastBook = null; s.sourceTime = -1; s.waitingForSnapshot = true;
          s.forecastRequiredAfter = interval.end;
        }
        interval.reset = true;
      }
    }
    if ((cancelLatencyMs > 0 || liquidationStartTime !== null) && t >= quoteStopTime && !exitCancellationScheduled) {
      for (const s of states.values()) for (const side of ['buy', 'sell']) cancel(s, side, quoteStopTime);
      exitCancellationScheduled = true;
    }
    for (const s of states.values()) {
      if (s.lastBook !== null && t - s.lastBook > maxBookAgeMs) {
        const staleAt = s.lastBook + maxBookAgeMs;
        cancel(s, 'buy', staleAt); cancel(s, 'sell', staleAt);
      }
      expireCancellations(s, t);
    }
  };
  let previous = -1, sourceTimestampReversals = 0, worstSourceTimestampReversalMs = 0, preactivationTradeEvents = 0, fees = 0, ignoredBeforeSnapshot = 0;
  const fills = [], crossedBookIntervals = [];
  const liquidate = (id, s, time) => {
    if (Math.abs(s.inventory) < 1e-9 || !usable(s, time) || s.active.buy || s.active.sell || s.pending.buy || s.pending.sell) return;
    const side = s.inventory > 0 ? 'sell' : 'buy';
    const bookSide = side === 'sell' ? 'buy' : 'sell';
    const levels = [...s.book[bookSide].entries()].sort((a, b) => side === 'sell' ? b[0] - a[0] : a[0] - b[0]);
    for (const [price, depth] of levels) {
      if (s.uncertain[bookSide].has(price)) continue;
      const executed = price + (side === 'buy' ? 1 : -1) * liquidationSlippageTicks * tickSize;
      if (!validPrice(executed)) continue;
      const perShareFee = takerFeeRate * executed * (1 - executed);
      const quantity = Math.min(Math.abs(s.inventory), depth,
        side === 'sell' ? s.yes : Math.max(0, cash - reservedCash()) / (executed + perShareFee));
      if (quantity <= 1e-9) continue;
      const fee = quantity * perShareFee;
      cash += (side === 'buy' ? -1 : 1) * quantity * executed - fee;
      fees += fee; applyInventoryFill(s, side, quantity, executed);
      fills.push({ market: id, timestamp: time, side, price: executed, displayedPrice: price,
        slippageCost: Math.abs(executed - price) * quantity, quantity, fee, kind: 'liquidation' });
      // Never consume the same historical depth twice without a fresh update.
      s.uncertain[bookSide].add(price);
      recordCapital();
      if (Math.abs(s.inventory) < 1e-9) break;
    }
  };
  const holdingDecisions = [];
  const reviewHolding = (id, s, time) => {
    if (Math.abs(s.inventory) < 1e-9 || time < s.fairValue.asOf ||
        (blackouts.length && s.fairValue.asOf < blackouts.at(-1).end) ||
        s.active.buy || s.active.sell || s.pending.buy || s.pending.sell) return;
    if (s.holdDecision === 'close') { liquidate(id, s, time); return; }
    const side = s.inventory > 0 ? 'buy' : 'sell';
    const quantity = Math.abs(s.inventory);
    let referenceValue;
    if (holdingReference === 'entry') referenceValue = s.inventoryBasis / quantity;
    else {
      if (!usable(s, time)) return;
      const levels = [...s.book[side].entries()].sort((a, b) => side === 'buy' ? b[0] - a[0] : a[0] - b[0]);
      let remaining = quantity, closeValue = 0;
      for (const [displayedPrice, depth] of levels) {
        if (s.uncertain[side].has(displayedPrice)) continue;
        const executed = displayedPrice + (side === 'buy' ? -1 : 1) * liquidationSlippageTicks * tickSize;
        if (!validPrice(executed)) continue;
        const fee = takerFeeRate * executed * (1 - executed);
        const amount = Math.min(remaining, depth);
        closeValue += amount * (side === 'buy' ? executed - fee : executed + fee);
        remaining -= amount;
        if (remaining < 1e-9) break;
      }
      // A top-of-book quote is not executable for the full position when depth
      // or available buyback collateral is insufficient.
      if (remaining >= 1e-9 || (side === 'sell' && closeValue > cash - reservedCash() + 1e-9)) return;
      referenceValue = closeValue / quantity;
    }
    const expectedAdvantage = side === 'buy' ? s.fairValue.probability - referenceValue : referenceValue - s.fairValue.probability;
    const decision = expectedAdvantage > holdingRiskMargin + 1e-12 ? 'hold' : 'close';
    if (decision !== s.holdDecision) holdingDecisions.push({ market: id, timestamp: time, inventory: s.inventory,
      probability: s.fairValue.probability, ...(holdingReference === 'entry' ? { entryBasis: referenceValue } : { executableValue: referenceValue }),
      expectedAdvantage, decision });
    s.holdDecision = decision;
    s.holdValid = decision === 'hold';
    if (decision === 'close') liquidate(id, s, time);
  };
  for (const event of input.events) {
    if (!number(event.timestamp) || event.timestamp < previous) throw new Error('Events must be ordered by receipt time');
    previous = event.timestamp;
    if (event.timestamp > input.exitTime) continue;
    prepareTime(event.timestamp);
    if (blackouts.some((interval) => event.timestamp >= interval.start && event.timestamp < interval.end)) {
      if (event.type === 'forecast') throw new Error('Forecast publication cannot occur during a data blackout');
      continue;
    }
    if (event.type === 'forecast') {
      if (!number(event.dataThrough) || event.dataThrough > event.timestamp || !event.probabilities ||
          typeof event.probabilities !== 'object' || Array.isArray(event.probabilities) ||
          Object.keys(event.probabilities).length !== states.size ||
          [...states.keys()].some((id) => !number(event.probabilities[id]) || event.probabilities[id] < 0 || event.probabilities[id] > 1) ||
          Object.values(event.probabilities).reduce((sum, value) => sum + value, 0) > 1 + 1e-9 ||
          [...states.values()].some((s) => event.timestamp < s.fairValue.asOf)) throw new Error('Invalid or future portfolio forecast');
      for (const [id, s] of states) {
        s.fairValue = { probability: event.probabilities[id], asOf: event.timestamp, dataThrough: event.dataThrough };
        activate(s, event.timestamp);
        if (exitMode === 'conditionalSettlement' && event.timestamp >= liquidationStartTime) {
          s.holdValid = false;
          reviewHolding(id, s, event.timestamp);
        }
        else if (event.timestamp < quoteStopTime && !blackouts.some((interval) => event.timestamp >= interval.stop && event.timestamp < interval.end)) quote(s, event.timestamp);
      }
      recordCapital();
      continue;
    }
    const s = states.get(event.market);
    if (!s) throw new Error('Event references an unknown market');
    if (event.timestamp < s.market.coverage.start) throw new Error('Event precedes market coverage');
    if (event.type === 'gap') throw new Error('Replay cannot cross a known data gap');
    if (event.sourceTimestamp !== undefined) {
      if (!number(event.sourceTimestamp) || event.sourceTimestamp > event.timestamp || event.timestamp - event.sourceTimestamp > maxSourceAgeMs) throw new Error('Source timestamps are invalid or too old');
      if (event.sourceTimestamp < s.sourceTime) {
        if (!allowSourceTimestampDisorder) throw new Error('Source timestamps are out of order');
        sourceTimestampReversals++;
        worstSourceTimestampReversalMs = Math.max(worstSourceTimestampReversalMs, s.sourceTime - event.sourceTimestamp);
      }
      s.sourceTime = event.sourceTimestamp;
    }
    if (s.firstEvent === null) s.firstEvent = event.timestamp;
    if (s.waitingForSnapshot && event.type !== 'snapshot') { ignoredBeforeSnapshot++; continue; }
    activate(s, event.timestamp);
    if (event.type === 'snapshot') {
      if (!Array.isArray(event.bids) || !Array.isArray(event.asks)) throw new Error('Invalid snapshot');
      for (const side of ['buy', 'sell']) { s.book[side].clear(); s.uncertain[side].clear(); }
      for (const [price, quantity] of event.bids) setLevel(s, 'buy', price, quantity);
      for (const [price, quantity] of event.asks) setLevel(s, 'sell', price, quantity);
      s.lastBook = event.timestamp; s.everHadSnapshot = true; s.waitingForSnapshot = false; s.version.buy++; s.version.sell++;
    } else if (event.type === 'update') {
      if (s.lastBook === null) throw new Error('An initial snapshot is required');
      setLevel(s, event.side, event.price, event.quantity);
      s.uncertain[event.side].delete(event.price); s.lastBook = event.timestamp; s.version[event.side]++;
    } else if (event.type === 'trade') {
      if (s.lastBook === null) throw new Error('An initial snapshot is required');
      if (!['buy', 'sell'].includes(event.side) || !validPrice(event.price) || !number(event.quantity) || event.quantity <= 0) throw new Error('Invalid trade');
      if (typeof event.eventId !== 'string' || !event.eventId || s.seenTradeEvents.has(event.eventId)) throw new Error('Trade requires a unique eventId within its market');
      s.seenTradeEvents.add(event.eventId);
      const side = event.side === 'buy' ? 'sell' : 'buy';
      s.uncertain[side].add(event.price);
      const order = s.active[side];
      // Stale or crossed local book data does not remove an order already at
      // the venue; it can fill until the modeled cancellation takes effect.
      const exactPrice = order && Math.abs(order.price - event.price) < 1e-9;
      const tradedThrough = order && tradeThroughFills && (side === 'buy' ? event.price < order.price - 1e-9 : event.price > order.price + 1e-9);
      if (order && (cancelLatencyMs > 0 || usable(s, event.timestamp)) && (exactPrice || tradedThrough)) {
        if (event.sourceTimestamp !== undefined && event.sourceTimestamp <= order.activateAt) preactivationTradeEvents++;
        else {
          // A worse-price print implies that earlier depth at our better price
          // was exhausted. Allocate no more than this print's own quantity;
          // the resulting counterfactual execution remains a model assumption.
          const ahead = tradedThrough ? 0 : Math.min(order.ahead, event.quantity);
          if (tradedThrough) order.ahead = 0;
          order.ahead -= ahead;
          const quantity = Math.min(order.remaining, event.quantity - ahead);
          if (quantity > 0) {
            cash += (side === 'buy' ? -1 : 1) * quantity * order.price;
            applyInventoryFill(s, side, quantity, order.price);
            order.remaining -= quantity;
            s.lastFillVersion[side] = s.version[side];
            fills.push({ market: event.market, timestamp: event.timestamp, side, price: order.price, quantity, fee: 0, kind: 'maker',
              eventId: event.eventId, ...(tradedThrough ? { tradeThrough: true } : {}), ...(event.transactionHash ? { transactionHash: event.transactionHash } : {}) });
            if (order.remaining <= 1e-9) s.active[side] = null;
          }
        }
      }
    } else throw new Error('Unknown event type');
    if (event.type === 'snapshot' || event.type === 'update') {
      const bid = best(s, 'buy'), ask = best(s, 'sell');
      const crossed = bid !== null && ask !== null && bid >= ask;
      if (crossed && !allowUnverifiedData) throw new Error('Crossed or locked book requires an explicitly conditional sensitivity');
      if (crossed && s.crossedSince === null) s.crossedSince = event.timestamp;
      if (!crossed && s.crossedSince !== null) {
        crossedBookIntervals.push({ market: event.market, start: s.crossedSince, end: event.timestamp, durationMs: event.timestamp - s.crossedSince });
        s.crossedSince = null;
      }
    }
    if (liquidationStartTime !== null && event.timestamp >= liquidationStartTime &&
        (event.type === 'snapshot' || event.type === 'update' ||
          (exitMode === 'conditionalSettlement' && event.type === 'trade'))) {
      if (exitMode === 'conditionalSettlement') {
        s.holdValid = false;
        reviewHolding(event.market, s, event.timestamp);
      }
      else liquidate(event.market, s, event.timestamp);
    }
    if (cash < -1e-8 || s.yes < -1e-8 || reservedCash() > cash + 1e-8) throw new Error('Collateral invariant failed');
    if ((liquidationStartTime === null ? cancelLatencyMs === 0 || event.timestamp < quoteStopTime : event.timestamp < quoteStopTime) &&
        !blackouts.some((interval) => event.timestamp >= interval.stop && event.timestamp < interval.end)) quote(s, event.timestamp);
    recordCapital();
  }
  prepareTime(input.exitTime);
  for (const [id, s] of states) {
    if (s.firstEvent === null || !s.everHadSnapshot) throw new Error('Each market requires an initial snapshot');
    if (s.crossedSince !== null) crossedBookIntervals.push({ market: id, start: s.crossedSince, end: input.exitTime, durationMs: input.exitTime - s.crossedSince });
    if (cancelLatencyMs > 0 && (s.active.buy || s.active.sell || s.pending.buy || s.pending.sell)) {
      throw new Error('Orders remain live at exit after modeled cancellation');
    }
    cancel(s, 'buy', input.exitTime); cancel(s, 'sell', input.exitTime);
  }
  let complete = true;
  const forcedCarries = [];
  if (exitMode === 'liquidation' || exitMode === 'conditionalSettlement') {
    // Stable input order is an explicit allocation policy when shared cash or depth is scarce.
    for (const [id, s] of states) {
      if (exitMode === 'conditionalSettlement') reviewHolding(id, s, input.exitTime);
      else liquidate(id, s, input.exitTime);
      if (Math.abs(s.inventory) >= 1e-9 && (exitMode === 'liquidation' || s.holdDecision !== 'hold' || !s.holdValid)) {
        if (allowForcedCarry && s.holdDecision === 'close') {
          const attempts = fills.filter((fill) => fill.market === id && fill.kind === 'liquidation');
          forcedCarries.push({ market: id, driver: s.market.driver, inventory: s.inventory,
            averageEntryPrice: s.inventoryBasis / Math.abs(s.inventory), basisAmount: s.inventoryBasis,
            basisSide: s.inventory > 0 ? 'purchase' : 'sale',
            closedShares: attempts.reduce((sum, fill) => sum + fill.quantity, 0),
            closingFees: attempts.reduce((sum, fill) => sum + fill.fee, 0),
            closingSlippage: attempts.reduce((sum, fill) => sum + fill.slippageCost, 0),
            reason: 'A model-directed close could not be completed before the deadline' });
        } else complete = false;
      }
    }
  }
  let settlementCash = 0;
  if (exitMode !== 'liquidation') for (const s of states.values()) {
    const payout = input.resolution.type === 'void' ? input.resolution.payouts[s.market.id] : input.resolution.type === 'winner' && input.resolution.driver === s.market.driver ? 1 : 0;
    settlementCash += s.yes * payout + s.no * (1 - payout);
  }
  const completeSetsValue = exitMode === 'liquidation' ? [...states.values()].reduce((sum, s) => sum + s.market.initialCompleteSets, 0) : 0;
  const profit = complete ? cash + settlementCash + completeSetsValue - initialCapital : null;
  let outcomeScenarios;
  if (exitMode === 'conditionalSettlement') {
    const other = cash + [...states.values()].reduce((sum, s) => sum + s.no, 0) - initialCapital;
    const winners = [...states.values()].map((s) => ({ driver: s.market.driver, profit: other + s.yes - s.no }));
    const voidProfit = cash + [...states.values()].reduce((sum, s) => sum + (s.yes + s.no) / 2, 0) - initialCapital;
    outcomeScenarios = { conditionalOnImmediateSettlement: true, decisionComplete: complete,
      flatBeforeRace: [...states.values()].every((s) => Math.abs(s.inventory) < 1e-9), forcedCarryCount: forcedCarries.length, winners, other,
      worstWinnerProfit: Math.min(other, ...winners.map((item) => item.profit)),
      uniformHalfPayoutVoidProfit: voidProfit };
  }
  return { race: input.race, dataClassification: allCoverageVerified && !allowSourceTimestampDisorder && crossedBookIntervals.length === 0 ? 'coverage attested; execution and signal assumptions unverified' : 'conditional sensitivity: unverified coverage, source order or crossed book',
    warning: 'Simulation only: execution, queue, model provenance, fee eligibility and historical completeness are not established by this program.',
    executionAssumptions: ['one second or configured submission latency', cancelLatencyMs === 0 ? 'immediate cancellation and requoting' : `cancellation latency ${cancelLatencyMs}ms; no replacement until cancellation`,
      'maker fees and rebates zero', 'single YES book per market; no negative-risk conversion',
      ...(liquidationStartTime !== null ? ['after liquidation start, close at the first usable recorded book after cancellation; retry on refreshed depth'] : []),
      ...(marketMidpointWeight > 0 ? [`quote fair value blends current recorded midpoint with model at weight ${marketMidpointWeight}`] : []),
      ...(exitMode === 'conditionalSettlement' ? [holdingReference === 'entry'
        ? `hold only when forecast advantage versus weighted-average entry price exceeds ${holdingRiskMargin} per share; entry basis is a sunk cost, not current exit value`
        : `hold only when forecast advantage versus fee- and slippage-adjusted close exceeds ${holdingRiskMargin} per share`] : []),
      ...(allowForcedCarry ? ['a model-directed close that cannot be completed is carried to settlement and reported separately'] : []),
      ...(blackouts.length ? ['orders are canceled before each data blackout; a new snapshot is required afterward'] : []),
      ...(tradeThroughFills ? ['worse-price prints imply an execution at the resting better price, capped by print size'] : [])],
    coverageAttested: allCoverageVerified, sourceTimestampOrderEnforced: !allowSourceTimestampDisorder,
    sourceTimestampReversals, worstSourceTimestampReversalMs, preactivationTradeEvents, crossedBookIntervals, exitMode, complete, initialCapital,
    peakCapitalCommitted, peakReservedCash, cashBeforeSettlement: cash,
    settlementCash, profit, fees, fills, ...(exitMode === 'conditionalSettlement' ? { holdingDecisions, outcomeScenarios, forcedCarries } : {}),
    ...(blackouts.length ? { ignoredBeforeSnapshot } : {}), markets: [...states.values()].map((s) => ({ id: s.market.id, driver: s.market.driver,
      yes: s.yes, no: s.no, inventory: s.inventory,
      ...(exitMode === 'conditionalSettlement' ? { holdDecision: s.holdDecision, holdValid: s.holdValid,
        inventoryBasis: s.inventoryBasis, averageEntryPrice: s.inventory ? s.inventoryBasis / Math.abs(s.inventory) : null } : {}) })) };
}
