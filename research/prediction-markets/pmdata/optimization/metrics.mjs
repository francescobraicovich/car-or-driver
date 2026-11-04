/** Per-race settled returns, without annualization or a nonzero risk-free rate. */
export function performanceMetrics(results, initialCapital = 100) {
  if (!Array.isArray(results) || !Number.isFinite(initialCapital) || initialCapital <= 0) {
    throw new Error('Results and a positive starting capital are required');
  }
  let expectedCapital = initialCapital;
  let peak = initialCapital;
  let maxDrawdown = 0;
  const returns = [], profits = [];
  let fills = 0, tradedRaces = 0, winningRaces = 0;
  for (const result of results) {
    if (!Number.isFinite(result.capitalBefore) || result.capitalBefore <= 0 ||
        !Number.isFinite(result.capitalAfter) || !Array.isArray(result.fills) ||
        Math.abs(result.capitalBefore - expectedCapital) > 1e-7) {
      throw new Error('Each settled race must carry forward the previous capital');
    }
    const profit = result.capitalAfter - result.capitalBefore;
    returns.push(profit / result.capitalBefore);
    profits.push(profit);
    fills += result.fills.length;
    if (result.fills.length) { tradedRaces++; if (profit > 1e-10) winningRaces++; }
    expectedCapital = result.capitalAfter;
    peak = Math.max(peak, expectedCapital);
    maxDrawdown = Math.max(maxDrawdown, (peak - expectedCapital) / peak);
  }
  const n = returns.length;
  const mean = n ? returns.reduce((a, b) => a + b, 0) / n : null;
  const variance = n > 1 ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : null;
  const deviation = variance === null ? null : Math.sqrt(variance);
  const downside = n ? Math.sqrt(returns.reduce((sum, value) => sum + Math.min(value, 0) ** 2, 0) / n) : null;
  const wins = profits.reduce((sum, value) => sum + Math.max(value, 0), 0);
  const losses = -profits.reduce((sum, value) => sum + Math.min(value, 0), 0);
  return { races: n, fills, tradedRaces, winningRaces, raceWinRate: tradedRaces ? winningRaces / tradedRaces : null,
    initialCapital, finalCapital: expectedCapital, profit: expectedCapital - initialCapital,
    returnFraction: expectedCapital / initialCapital - 1, returns,
    meanRaceReturn: mean, sharpePerRace: deviation && deviation > 1e-12 ? mean / deviation : null,
    sortinoPerRace: downside && downside > 1e-12 ? mean / downside : null,
    profitFactor: losses > 1e-10 ? wins / losses : null, maxSettledDrawdown: maxDrawdown,
    worstSettledRaceReturn: n ? Math.min(...returns) : null,
    returnToSettledDrawdown: maxDrawdown > 1e-12 ? (expectedCapital / initialCapital - 1) / maxDrawdown : null };
}

/** Objectives are undefined without fills in at least two races or a valid denominator. */
export function eligibleObjective(metrics, name = 'sharpePerRace') {
  if (!['sharpePerRace', 'sortinoPerRace', 'profitFactor', 'returnToSettledDrawdown'].includes(name)) {
    throw new Error('Unsupported optimization objective');
  }
  return metrics.tradedRaces >= 2 && Number.isFinite(metrics[name]) ? metrics[name] : null;
}

/** Independent per-race liquidation results; no compounded/shared-cash claim. */
export function independentLiquidationMetrics(results, capitalPerRace = 100) {
  if (!Array.isArray(results) || !Number.isFinite(capitalPerRace) || capitalPerRace <= 0) {
    throw new Error('Liquidations and a positive per-race capital are required');
  }
  if (!results.length) return { available: false, reason: 'No races in split' };
  if (results.some((row) => row.complete !== true || !Number.isFinite(row.profit) || !Array.isArray(row.fills))) {
    return { available: false, reason: 'At least one race could not be liquidated completely' };
  }
  const returns = results.map((row) => row.profit / capitalPerRace);
  const n = returns.length, mean = returns.reduce((sum, value) => sum + value, 0) / n;
  const deviation = n > 1 ? Math.sqrt(returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)) : null;
  const downside = Math.sqrt(returns.reduce((sum, value) => sum + Math.min(value, 0) ** 2, 0) / n);
  const wins = results.reduce((sum, row) => sum + Math.max(row.profit, 0), 0);
  const losses = -results.reduce((sum, row) => sum + Math.min(row.profit, 0), 0);
  let hypotheticalEquity = capitalPerRace, peak = capitalPerRace, maxDrawdown = 0;
  for (const row of results) {
    hypotheticalEquity += row.profit;
    peak = Math.max(peak, hypotheticalEquity);
    maxDrawdown = Math.max(maxDrawdown, (peak - hypotheticalEquity) / peak);
  }
  return { available: true, note: `Independent ${capitalPerRace}-unit per-race resets; drawdown is on summed hypothetical P&L, not a shared-cash equity path`,
    races: n, capitalPerRace, fills: results.reduce((sum, row) => sum + row.fills.length, 0),
    tradedRaces: results.filter((row) => row.fills.some((fill) => fill.kind === 'maker')).length,
    sumIndependentProfits: results.reduce((sum, row) => sum + row.profit, 0), returns, meanRaceReturn: mean,
    sharpePerRace: deviation && deviation > 1e-12 ? mean / deviation : null,
    sortinoPerRace: downside > 1e-12 ? mean / downside : null,
    profitFactor: losses > 1e-10 ? wins / losses : null,
    maxHypotheticalResetDrawdown: maxDrawdown, worstRaceReturn: Math.min(...returns) };
}
