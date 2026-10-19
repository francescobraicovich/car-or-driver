// Helpers for the parameter searches of the research scripts: a fast `params -> score` function and a seeded sampler.
import { buildEloCore } from './elo-core.js';
import { backtestObjective, preWeekendObjective, summarizeBacktest } from './backtest.js';
import { truncateDataset } from './dataset.js';

/**
 * A fast `params -> score` function for searches over one dataset and window.
 *
 * Builds are lean (no report rows) and reuse a cache of everything that does
 * not depend on the parameters, so after the first call each score costs a
 * fraction of `evaluate()`; the value returned is identical to it.
 *
 * @param {{raw, lapSnapshots, maps, lapPace}} ctx  loaded dataset
 * @param {{fromYear?: number, toYear?: number, burnIn?: number, objective?: 'full'|'pre'}} window
 */
export function createScorer(ctx, { fromYear = 2000, toYear = Infinity, burnIn = 20, objective = 'full' } = {}) {
  const data = Number.isFinite(toYear) ? truncateDataset(ctx, toYear) : ctx;
  const cache = {};
  return (params) => {
    const model = buildEloCore(data.raw, data.lapSnapshots, data.maps, params, data.lapPace, null, { lean: true, cache });
    const summary = summarizeBacktest(model, { burnIn, fromYear, toYear });
    return objective === 'pre' ? preWeekendObjective(summary) : backtestObjective(summary);
  };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
