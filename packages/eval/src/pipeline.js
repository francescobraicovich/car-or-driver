// From the project's data to the harness's inputs, and the forecast layer's scores.
//
// The timeline is cut at 2015 before filters run unless holdout data are requested.
import { finishStateSpace, ssContext, canonicalTeam, carLineage } from '../../core/src/state-space/build.js';
import { collectExam } from '../../core/src/state-space/exam.js';
import { summarizeBacktest } from '../../core/src/backtest.js';
import { HOLDOUT_FROM, timelineFromExam } from './timeline.js';

/**
 * @param {{ raw, lapSnapshots, maps, lapPace }} data   what the dataset loader returns
 * @param {{ holdout?: boolean }} [o]
 */
export function prepareReal(data, { holdout = false } = {}) {
  const { model, weekends } = collectExam(data.raw, data.lapSnapshots, data.maps, {}, data.lapPace);
  const n = holdout ? weekends.length : weekends.filter((w) => w.year < HOLDOUT_FROM).length;
  const timeline = timelineFromExam(weekends, model.snaps).slice(0, n);
  return {
    data,
    model,
    weekends,
    n,
    timeline,
    ctx: ssContext(model.params.tmBoost),
    identity: { canon: canonicalTeam, carOf: carLineage },
  };
}

const WINDOWS_FORECAST = [
  { id: 'w2', label: '2008-2011', from: 2008, to: 2011 },
  { id: 'w3', label: '2012-2015', from: 2012, to: 2015 },
  { id: 'holdout', label: '2016+', from: 2016, to: 9999, holdout: true },
];

/** The forecast layer's per-window scores from a model's snapshots: race-day, Thursday (both combined) and qualifying head. */
export function forecastScores(model, n, { holdout = false } = {}) {
  const view = { ...model, snaps: model.snaps.slice(0, n) };
  const out = {};
  for (const win of WINDOWS_FORECAST) {
    if (win.holdout && !holdout) continue;
    const o = summarizeBacktest(view, { burnIn: 0, fromYear: win.from, toYear: win.to }).overall;
    if (!o.totalWeight) continue;
    out[win.id] = {
      label: win.label,
      raceDay: o.combinedLogLoss,
      thursday: o.preCombinedLogLoss,
      qual: o.qualLogLoss,
      raceBrier: o.raceBrier,
      raceAcc: o.raceAcc,
      qualBrier: o.qualBrier,
      qualAcc: o.qualAcc,
    };
  }
  return out;
}

/**
 * Replay the forecast layer on the state-space ratings and score it. Overwrites the snapshots of `prep.model`.
 * @param {object} prep   prepareReal(...)
 * @param {{ race: object, qual: object }} runs   state-space rating runs (each carries the filter's output in `raw`)
 */
export function stateSpaceForecastScores(prep, runs, { holdout = false } = {}) {
  const model = { ...prep.model, snaps: prep.model.snaps.slice(0, prep.n) };
  finishStateSpace(model, prep.weekends.slice(0, prep.n), runs.race.raw, runs.qual.raw, { raw: prep.data.raw, lapPace: prep.data.lapPace });
  return forecastScores(model, prep.n, { holdout });
}
