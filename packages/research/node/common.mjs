// Shared node harness: load the vendored CSVs, build models, score backtests.
import { readFile } from 'node:fs/promises';
import { REQUIRED_CSVS, createDataset } from '../../core/src/dataset.js';
import { buildEloCore, DEFAULT_PARAMS } from '../../core/src/elo-core.js';
import { summarizeBacktest, backtestObjective, preWeekendObjective } from '../../core/src/backtest.js';

export { DEFAULT_PARAMS };

const OPTIONAL = ['circuits.csv']; // absent: no circuit names or home-race flags

/** Load `dir` into `{ raw, maps, lapSnapshots, lapPace }` (no global state). */
export async function loadData(dir = 'data') {
  const texts = {};
  await Promise.all(
    [...REQUIRED_CSVS, 'lap_times.csv', ...OPTIONAL].map(async (name) => {
      try {
        texts[name] = await readFile(`${dir}/${name}`, 'utf8');
      } catch (e) {
        if (!OPTIONAL.includes(name)) throw e;
      }
    }),
  );
  return createDataset(texts);
}

/** Build + score. Returns { score, preScore, summary, model }. */
export function evaluate(params, ctx, { fromYear = 2000, toYear = 2015, burnIn = 20, objective = 'full' } = {}) {
  const model = buildEloCore(ctx.raw, ctx.lapSnapshots, ctx.maps, params, ctx.lapPace || null);
  const summary = summarizeBacktest(model, { burnIn, fromYear, toYear });
  const score = objective === 'pre' ? preWeekendObjective(summary) : backtestObjective(summary);
  return { score, preScore: preWeekendObjective(summary), summary, model };
}
