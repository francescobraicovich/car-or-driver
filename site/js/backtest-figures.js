// Backtest figures for the methodology page: the per-season loss series and the ratings alone, by window.
import { NAIVE_LOGLOSS, summarizeBacktest } from '../../packages/core/src/backtest.js';

export function seasonLossSeries(seasons) {
  return [
    ['raceLogLoss', 'Race', 'var(--s1)', ''],
    ['qualLogLoss', 'Qualifying', 'var(--s2)', ''],
    ['combinedLogLoss', 'Combined', 'var(--s3)', ''],
    ['naive', 'Coin flip', 'var(--ink-3)', ''],
  ].map(([id, name, color, dash]) => ({
    id,
    name,
    color,
    dash,
    points: seasons.flatMap((s) => {
      const point = { date: `${s.year}-07-01`, year: s.year, contiguous: true, v: id === 'naive' ? NAIVE_LOGLOSS : s[id] };
      return id === 'naive' ? [{ ...point, date: `${s.year}-01-01` }, point, { ...point, date: `${s.year}-12-31` }] : [point];
    }),
  }));
}

export const hasRatingsDiag = (model) => !!model?.snaps?.some((snap) => snap.ssDiag);

/** The ratings alone, by window. */
export function ratingsWindows(model) {
  return [
    ['2000–2007', 2000, 2007],
    ['2008–2011', 2008, 2011],
    ['2012–2015', 2012, 2015],
    ['2016 to now', 2016, Infinity],
  ].map(([label, fromYear, toYear]) => ({
    label,
    ratings: summarizeBacktest(model, { burnIn: 20, fromYear, toYear, diag: 'ssDiag' }).overall,
  }));
}
