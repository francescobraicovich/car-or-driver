/** Replay one binary market. See README.md for assumptions and schema. */
export function replayMarket(input, options = {}) {
  const {
    tickSize = 0.01,
    orderSize = 5,
    maxInventory = 10,
    inventorySkewTicks = 0.1,
    latencyMs = 1000,
    maxBookAgeMs = 60000,
    maxSourceAgeMs = maxBookAgeMs,
    feeMode = 'flat',
    makerFeeRate = 0,
    takerFeeRate = 0,
    liquidationSlippageTicks = 1,
    initialCompleteSets = maxInventory,
    initialCash = maxInventory * 2,
    minimumEdgeTicks = 1,
  } = options;
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const requireNumber = (value, name, min, max = Infinity) => {
    if (!finite(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  };
  const winner = input?.instrument?.type === 'race-winner';
  if (winner ? !input.instrument.driver || !input.instrument.race :
    !input?.pair?.driverA || !input?.pair?.driverB || input.pair.driverA === input.pair.driverB) {
    throw new Error('A race winner instrument or a pair of distinct drivers is required');
  }
  requireNumber(input.firstPractice, 'firstPractice', 0);
  requireNumber(input.exitTime, 'exitTime', 0);
  if (input.exitTime >= input.firstPractice) throw new Error('exitTime must precede first practice');
  if (!['liquidation', 'settlement'].includes(input.exitMode)) throw new Error('Invalid exitMode');
  if (input.exitMode === 'settlement' && ![0, 0.5, 1].includes(input.settlement)) {
    throw new Error('Settlement must be 0, 0.5, or 1');
  }
  requireNumber(tickSize, 'tickSize', 0.000001, 0.5);
  requireNumber(orderSize, 'orderSize', 0.000001);
  requireNumber(maxInventory, 'maxInventory', 0.000001);
  requireNumber(inventorySkewTicks, 'inventorySkewTicks', 0);
  requireNumber(latencyMs, 'latencyMs', 0);
  requireNumber(maxBookAgeMs, 'maxBookAgeMs', 1);
  requireNumber(maxSourceAgeMs, 'maxSourceAgeMs', 1);
  if (!['flat', 'polymarket'].includes(feeMode)) throw new Error('Invalid feeMode');
  if (feeMode === 'polymarket' && (!Object.hasOwn(options, 'takerFeeRate') || makerFeeRate !== 0)) {
    throw new Error('Polymarket requires an explicit historical takerFeeRate and zero maker fee');
  }
  requireNumber(makerFeeRate, 'makerFeeRate', 0, 1);
  requireNumber(takerFeeRate, 'takerFeeRate', 0, 1);
  requireNumber(liquidationSlippageTicks, 'liquidationSlippageTicks', 0);
  requireNumber(initialCompleteSets, 'initialCompleteSets', 0);
  requireNumber(initialCash, 'initialCash', 0);
  requireNumber(minimumEdgeTicks, 'minimumEdgeTicks', 0);
  if (!Number.isInteger(minimumEdgeTicks)) throw new Error('Invalid minimumEdgeTicks');
  if (winner && !input.fairValue) throw new Error('Race winner markets require a dated fair value');
  if (input.fairValue) {
    requireNumber(input.fairValue.probability, 'fair value probability', 0, 1);
    requireNumber(input.fairValue.asOf, 'fair value asOf', 0);
    if (input.fairValue.asOf > input.exitTime) throw new Error('Fair value must be available before exit');
  }
  if (!Array.isArray(input.events)) throw new Error('events must be an array');
  if (input.coverage?.complete !== true || !finite(input.coverage.start) || !finite(input.coverage.end) || input.coverage.end < input.exitTime) {
    throw new Error('Verified coverage through exitTime is required');
  }

  const book = { buy: new Map(), sell: new Map() };
  const uncertainLevels = { buy: new Set(), sell: new Set() };
  const orders = { buy: null, sell: null };
  const pending = { buy: null, sell: null };
  const lastFillVersion = { buy: -1, sell: -1 };
  const version = { buy: 0, sell: 0 };
  let lastBookTime = null;
  let previousTime = -1;
  let previousSourceTime = -1;
  let inventory = 0;
  let cash = 0;
  let fees = 0;
  const fills = [];
  const validPrice = (price) => finite(price) && price > 0 && price < 1;
  const feePerShare = (price, kind) => feeMode === 'polymarket'
    ? (kind === 'maker' ? 0 : takerFeeRate * price * (1 - price))
    : price * (kind === 'maker' ? makerFeeRate : takerFeeRate);
  const setLevel = (side, price, quantity) => {
    if (!['buy', 'sell'].includes(side) || !validPrice(price) || !finite(quantity) || quantity < 0) {
      throw new Error('Invalid book level');
    }
    if (quantity === 0) book[side].delete(price);
    else book[side].set(price, quantity);
  };
  const best = (side) => {
    const prices = [...book[side].keys()];
    return prices.length ? (side === 'buy' ? Math.max(...prices) : Math.min(...prices)) : null;
  };
  const usable = (timestamp) => {
    const bid = best('buy');
    const ask = best('sell');
    return lastBookTime !== null && timestamp - lastBookTime <= maxBookAgeMs && bid !== null && ask !== null && bid < ask;
  };
  const activate = (timestamp) => {
    for (const side of ['buy', 'sell']) {
      const candidate = pending[side];
      if (!candidate || candidate.at > timestamp) continue;
      pending[side] = null;
      if (!usable(timestamp)) continue;
      // Post-only: reject an order if the book moved across it during submission.
      if ((side === 'buy' && candidate.price >= best('sell')) || (side === 'sell' && candidate.price <= best('buy'))) continue;
      orders[side] = { price: candidate.price, remaining: candidate.quantity, ahead: book[side].get(candidate.price) || 0 };
    }
  };
  const quote = (timestamp) => {
    if (!usable(timestamp) || (input.fairValue && timestamp < input.fairValue.asOf)) {
      orders.buy = orders.sell = pending.buy = pending.sell = null;
      return;
    }
    const shift = Math.round(inventory * inventorySkewTicks) * tickSize;
    for (const side of ['buy', 'sell']) {
      const limit = side === 'buy' ? maxInventory - inventory : maxInventory + inventory;
      let raw = best(side) - shift;
      if (input.fairValue) {
        const edge = minimumEdgeTicks * tickSize;
        const fairLimit = input.fairValue.probability + (side === 'buy' ? -edge : edge);
        const limitTicks = side === 'buy' ? Math.floor(fairLimit / tickSize + 1e-9) : Math.ceil(fairLimit / tickSize - 1e-9);
        const limit = limitTicks * tickSize;
        raw = side === 'buy' ? Math.min(raw, limit) : Math.max(raw, limit);
      }
      const price = Math.round(raw / tickSize) * tickSize;
      const capacity = side === 'buy' ? Math.max(0, initialCash + cash) / (price + feePerShare(price, 'maker')) : Math.max(0, initialCompleteSets + inventory);
      const quantity = Math.min(orderSize, Math.max(0, limit), capacity);
      const safe = validPrice(price) && quantity > 1e-9 &&
        (side === 'buy' ? price < best('sell') : price > best('buy'));
      if (!safe || (orders[side] && (Math.abs(orders[side].price - price) > 1e-9 || orders[side].remaining > quantity + 1e-9))) orders[side] = null;
      if (!safe || (pending[side] && (Math.abs(pending[side].price - price) > 1e-9 || pending[side].quantity > quantity + 1e-9))) pending[side] = null;
      // Do not replenish from a book that predates the preceding fill.
      if (safe && !orders[side] && !pending[side] && version[side] > lastFillVersion[side]) {
        pending[side] = { price, quantity, at: timestamp + latencyMs };
      }
    }
    activate(timestamp);
  };
  const fill = (side, price, quantity, timestamp, kind) => {
    const fee = quantity * feePerShare(price, kind);
    inventory += side === 'buy' ? quantity : -quantity;
    cash += (side === 'buy' ? -1 : 1) * price * quantity - fee;
    fees += fee;
    fills.push({ timestamp, side, price, quantity, fee, kind });
  };

  for (const event of input.events) {
    if (!finite(event.timestamp) || event.timestamp < previousTime) throw new Error('Events must have nondecreasing timestamps');
    previousTime = event.timestamp;
    if (event.timestamp > input.exitTime) continue;
    if (event.type === 'gap') throw new Error('Replay cannot cross a known data gap');
    if (event.sourceTimestamp !== undefined) {
      if (!finite(event.sourceTimestamp) || event.sourceTimestamp > event.timestamp || event.timestamp - event.sourceTimestamp > maxSourceAgeMs) {
        throw new Error('Source timestamp is invalid or too old for this replay');
      }
      if (event.sourceTimestamp < previousSourceTime) throw new Error('Source timestamps are out of order');
      previousSourceTime = event.sourceTimestamp;
    }
    activate(event.timestamp);
    if (event.type === 'snapshot') {
      if (!Array.isArray(event.bids) || !Array.isArray(event.asks)) throw new Error('Invalid snapshot');
      book.buy.clear();
      book.sell.clear();
      uncertainLevels.buy.clear();
      uncertainLevels.sell.clear();
      for (const [price, quantity] of event.bids) setLevel('buy', price, quantity);
      for (const [price, quantity] of event.asks) setLevel('sell', price, quantity);
      lastBookTime = event.timestamp;
      version.buy++;
      version.sell++;
    } else if (event.type === 'update') {
      if (lastBookTime === null) throw new Error('An initial snapshot is required');
      setLevel(event.side, event.price, event.quantity);
      uncertainLevels[event.side].delete(event.price);
      lastBookTime = event.timestamp;
      version[event.side]++;
    } else if (event.type === 'trade') {
      if (lastBookTime === null) throw new Error('An initial snapshot is required');
      if (!['buy', 'sell'].includes(event.side) || !validPrice(event.price) || !finite(event.quantity) || event.quantity <= 0) throw new Error('Invalid trade');
      const side = event.side === 'buy' ? 'sell' : 'buy';
      uncertainLevels[side].add(event.price);
      const order = orders[side];
      if (order && usable(event.timestamp) && Math.abs(order.price - event.price) < 1e-9) {
        const consumedAhead = Math.min(order.ahead, event.quantity);
        order.ahead -= consumedAhead;
        const quantity = Math.min(order.remaining, event.quantity - consumedAhead);
        if (quantity > 0) {
          fill(side, order.price, quantity, event.timestamp, 'maker');
          lastFillVersion[side] = version[side];
          order.remaining -= quantity;
          if (order.remaining <= 1e-9) orders[side] = null;
        }
      }
    } else {
      throw new Error('Unknown event type');
    }
    quote(event.timestamp);
  }
  if (lastBookTime === null) throw new Error('An initial snapshot is required');
  if (input.events[0].timestamp < input.coverage.start) throw new Error('Events precede declared coverage');
  let complete = true;
  if (input.exitMode === 'liquidation' && Math.abs(inventory) > 1e-9) {
    if (!usable(input.exitTime)) complete = false;
    else {
      const side = inventory > 0 ? 'sell' : 'buy';
      const available = [...book[side === 'sell' ? 'buy' : 'sell'].entries()].sort((a, b) => side === 'sell' ? b[0] - a[0] : a[0] - b[0]);
      for (const [price, depth] of available) {
        if (uncertainLevels[side === 'sell' ? 'buy' : 'sell'].has(price)) continue;
        const executionPrice = price + (side === 'buy' ? 1 : -1) * tickSize * liquidationSlippageTicks;
        if (!validPrice(executionPrice)) continue;
        const affordable = side === 'buy' ? Math.max(0, initialCash + cash) / (executionPrice + feePerShare(executionPrice, 'liquidation')) : Math.max(0, initialCompleteSets + inventory);
        const quantity = Math.min(Math.abs(inventory), depth, affordable);
        if (quantity > 0) fill(side, executionPrice, quantity, input.exitTime, 'liquidation');
        if (Math.abs(inventory) <= 1e-9) break;
      }
      complete = Math.abs(inventory) <= 1e-9;
    }
  }
  let settlementCash = 0;
  if (input.exitMode === 'settlement') {
    settlementCash = inventory * input.settlement;
    cash += settlementCash;
  }
  return { ...(winner ? { instrument: input.instrument } : { pair: input.pair }), ...(input.fairValue ? { fairValue: input.fairValue } : {}), exitTime: input.exitTime, exitMode: input.exitMode, complete, profit: complete ? cash : null, cash, fees, inventory, settlementCash, initialCompleteSets, initialCash, cashBalanceBeforeSettlement: initialCash + cash - settlementCash, yesBalanceBeforeSettlement: initialCompleteSets + inventory, noBalanceBeforeSettlement: initialCompleteSets, fills };
}
