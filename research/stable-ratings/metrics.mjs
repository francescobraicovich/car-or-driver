import { clusterBootstrap, mean, nll, quantile } from '../../packages/eval/src/stats.js';
import { pairedDifference, VALIDATION_FOLDS } from '../../packages/eval/src/chronological-validation.js';

const cells = ['race.5', 'race.10', 'qual.5', 'qual.10'];
const moveKey = (row) => `${row.year}:${row.driverId}:${row.t0}`;
const average = (rows, value) => rows.reduce((sum, row) => sum + row.w * value(row), 0) / rows.reduce((sum, row) => sum + row.w, 0);
const interval = (items, cluster, statistic, options) => items.length ? clusterBootstrap(items, cluster, statistic, options) : null;

// The resampling unit is a move object, already reduced within each cell. Duplicated
// bootstrap draws stay separate; regrouping by identity would discard multiplicity.
function moveObjects(reference, candidate) {
  if (reference.length || candidate.length) pairedDifference(reference, candidate, moveKey, 0);
  const moves = new Map();
  reference.forEach((row, index) => {
    const key = moveKey(row);
    if (!moves.has(key)) moves.set(key, { key, year: row.year, rows: {} });
    const cell = `${row.session}.${row.horizon}.${row.kind}`;
    const group = moves.get(key).rows[cell] ??= [];
    group.push({ ...row, candidateLogit: candidate[index].logit });
  });
  return [...moves.values()].map(({ rows, ...move }) => ({
    ...move,
    cells: Object.fromEntries(Object.entries(rows).map(([key, group]) => [key, {
      reference: average(group, (r) => nll(r.logit, r.o)),
      candidate: average(group, (r) => nll(r.candidateLogit, r.o)),
      observations: group.length,
    }])),
  }));
}

function cellMean(moves, cell, model) {
  const values = moves.filter((move) => move.cells[cell]).map((move) => move.cells[cell][model]);
  return values.length ? mean(values) : NaN;
}
function primary(moves, model) {
  const values = cells.map((cell) => cellMean(moves, `${cell}.tm`, model));
  return values.every(Number.isFinite) ? mean(values) : NaN;
}
function cellReport(moves, rows, cell, options) {
  const selected = moves.filter((move) => move.cells[cell]);
  const statistic = (sample) => cellMean(sample, cell, 'candidate') - cellMean(sample, cell, 'reference');
  return {
    moves: selected.length,
    observations: selected.reduce((sum, move) => sum + move.cells[cell].observations, 0),
    reference: cellMean(selected, cell, 'reference'),
    candidate: cellMean(selected, cell, 'candidate'),
    difference: interval(selected, (move) => move.key, statistic, options),
    seasonSensitivity: interval(selected, (move) => move.year, statistic, options),
    rowWeightedReference: rows.length ? average(rows, (row) => nll(row.logit, row.o)) : null,
    rowWeightedCandidate: rows.length ? average(rows, (row) => nll(row.candidateLogit, row.o)) : null,
  };
}
function moverPeriod(reference, candidate, options) {
  const moves = moveObjects(reference, candidate);
  const primaryMoves = moves.filter((move) => cells.some((cell) => move.cells[`${cell}.tm`]));
  const statistic = (sample) => primary(sample, 'candidate') - primary(sample, 'reference');
  const report = {};
  for (const cell of cells) for (const kind of ['tm', 'fd']) {
    const key = `${cell}.${kind}`;
    const rows = reference.flatMap((row, index) => `${row.session}.${row.horizon}.${row.kind}` === key ? [{ ...row, candidateLogit: candidate[index].logit }] : []);
    report[key] = cellReport(moves, rows, key, options);
  }
  return {
    moves: moves.length,
    primary: { moves: primaryMoves.length, reference: primary(primaryMoves, 'reference'), candidate: primary(primaryMoves, 'candidate'),
      difference: interval(primaryMoves, (move) => move.key, statistic, options),
      seasonSensitivity: interval(primaryMoves, (move) => move.year, statistic, options) },
    cells: report,
  };
}

/** Input is the output of chronologicalValidation, after checking omitted identities. */
export function moverReport(reference, candidate, { folds = VALIDATION_FOLDS, bootstrap = {} } = {}) {
  const period = (from, to) => {
    const select = (rows) => rows.filter((row) => row.year >= from && row.year <= to);
    return moverPeriod(select(reference.movers), select(candidate.movers), bootstrap);
  };
  return { pooled: period(folds[0].from, folds.at(-1).to), folds: folds.map(({ from, to }) => ({ from, to, ...period(from, to) })) };
}

/** Ordinary forecasts remain weighted by the observation exam and clustered by season. */
export function forecastReport(reference, candidate, { folds = VALIDATION_FOLDS, bootstrapRepetitions = 300 } = {}) {
  const period = (from, to) => {
    const select = (rows, filter) => rows.filter((row) => row.year >= from && row.year <= to && filter(row));
    const report = {};
    for (const [name, filter] of Object.entries({ all: () => true, raceTeammate: (r) => r.session === 'race' && r.same, qualTeammate: (r) => r.session === 'qual' && r.same })) {
      const a = select(reference.forecasts, filter), b = select(candidate.forecasts, filter);
      report[name] = a.length || b.length ? pairedDifference(a, b, (row) => row.year, bootstrapRepetitions) : null;
    }
    return report;
  };
  return { pooled: period(folds[0].from, folds.at(-1).to), folds: folds.map(({ from, to }) => ({ from, to, ...period(from, to) })) };
}

function summarize(rows, options) {
  const seasonInterval = (statistic) => options.B === 0 ? null : interval(rows, (row) => row.year, statistic, options);
  const absolute = rows.map((row) => Math.abs(row.delta));
  const reversals = rows.filter((row) => Number.isFinite(row.previousDelta) && row.previousDelta !== 0 && row.delta !== 0);
  const rate = (sample) => {
    const eligible = sample.filter((row) => Number.isFinite(row.previousDelta) && row.previousDelta !== 0 && row.delta !== 0);
    return eligible.length ? mean(eligible.map((row) => Number(row.delta * row.previousDelta < 0))) : NaN;
  };
  return {
    observations: rows.length, drivers: new Set(rows.map((row) => row.driverId)).size,
    median: quantile(absolute, 0.5), p90: quantile(absolute, 0.9), p99: quantile(absolute, 0.99), max: absolute.length ? Math.max(...absolute) : null,
    reversalEligible: reversals.length, reversalRate: rate(rows),
    vShapeAtLeast5: reversals.filter((row) => row.delta * row.previousDelta < 0 && Math.abs(row.delta) >= 5 && Math.abs(row.previousDelta) >= 5).length,
    p90SeasonInterval: seasonInterval((sample) => quantile(sample.map((row) => Math.abs(row.delta)), 0.9)),
    p99SeasonInterval: seasonInterval((sample) => quantile(sample.map((row) => Math.abs(row.delta)), 0.99)),
    reversalSeasonInterval: seasonInterval(rate),
  };
}

/** Raw means only: pre.rated is centered on posted drivers before comparison with post.drivers[id].m. Categories may overlap. */
export function stabilityReport(idx, run, { from = 2008, to = 2025, bootstrap = {} } = {}) {
  const groups = { postToPost: [], preToPost: [] };
  const fieldSpreads = idx.timeline.map((weekend, t) => {
    const posted = run.post[t]?.drivers;
    const ids = new Set(weekend.rows?.map((row) => String(row.driverId)) ?? []);
    const values = [...ids].flatMap((id) => {
      const rating = posted?.get(id);
      return rating?.seen !== false && Number.isFinite(rating?.m) ? [rating.m] : [];
    });
    if (values.length < 2) return NaN;
    const average = mean(values);
    return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
  });
  const preCenters = run.pre.map((snapshot, t) => {
    const posted = run.post[t]?.drivers;
    const values = posted ? [...posted.keys()].flatMap((id) => {
      const value = snapshot?.rated.get(id);
      return Number.isFinite(value) ? [value] : [];
    }) : [];
    return values.length ? mean(values) : NaN;
  });
  for (const [driverId, appearances] of idx.appear) {
    let priorPost, priorAppearance, priorPostChange, priorUpdate;
    for (const appearance of appearances) {
      const t = appearance.i, year = idx.timeline[t].year;
      const post = run.post[t]?.drivers.get(driverId);
      const after = post?.seen === false ? NaN : post?.m;
      const before = run.pre[t]?.rated.get(driverId) - preCenters[t];
      const boundary = priorAppearance && idx.timeline[priorAppearance.i].year !== year;
      const teamChange = priorAppearance && priorAppearance.team !== appearance.team;
      if (Number.isFinite(after) && Number.isFinite(priorPost)) {
        const delta = after - priorPost;
        if (year >= from && year <= to) groups.postToPost.push({ driverId, year, weekend: t, delta, previousDelta: priorPostChange, boundary, teamChange });
        priorPostChange = delta;
      } else priorPostChange = undefined;
      if (Number.isFinite(before) && Number.isFinite(after)) {
        const delta = after - before;
        if (year >= from && year <= to) groups.preToPost.push({ driverId, year, weekend: t, delta, previousDelta: priorUpdate, boundary, teamChange });
        priorUpdate = delta;
      } else priorUpdate = undefined;
      priorPost = after;
      priorAppearance = appearance;
    }
  }
  return Object.fromEntries(Object.entries(groups).map(([name, rows]) => {
    const byWeekend = new Map();
    for (const row of rows) { if (!byWeekend.has(row.weekend)) byWeekend.set(row.weekend, []); byWeekend.get(row.weekend).push(row.delta); }
    const shifts = [...byWeekend.values()].map(mean);
    const categories = { all: () => true, withinSeason: (r) => r.boundary === false, seasonBoundary: (r) => !!r.boundary, teamChange: (r) => !!r.teamChange };
    const availableFieldSpreads = [...byWeekend.keys()].map((t) => fieldSpreads[t]).filter((value) => Number.isFinite(value) && value > 0);
    const normalized = name === 'postToPost' ? {
      fieldWeekends: availableFieldSpreads.length, unavailableFieldWeekends: byWeekend.size - availableFieldSpreads.length,
      medianFieldSD: quantile(availableFieldSpreads, 0.5),
      categories: Object.fromEntries(Object.entries(categories).map(([key, filter]) => {
        const selected = rows.filter(filter);
        const values = selected.flatMap((row) => {
          const spread = fieldSpreads[row.weekend];
          return Number.isFinite(spread) && spread > 0 ? [Math.abs(row.delta) / spread] : [];
        });
        return [key, { observations: values.length, unavailable: selected.length - values.length,
          median: quantile(values, 0.5), p90: quantile(values, 0.9), p99: quantile(values, 0.99), max: values.length ? Math.max(...values) : null }];
      })),
    } : undefined;
    return [name, {
      ...(normalized ? { normalizedByFieldSpread: normalized } : {}),
      normalization: name === 'preToPost' ? 'Pre-weekend portable means centered over posted drivers with finite pre-weekend means; post-weekend means as provided.' : 'Post-weekend means as provided.',
      categories: Object.fromEntries(Object.entries(categories).map(([key, filter]) => [key, summarize(rows.filter(filter), bootstrap)])),
      commonShift: { weekends: shifts.length, medianAbsolute: quantile(shifts.map(Math.abs), 0.5), p90Absolute: quantile(shifts.map(Math.abs), 0.9), maxAbsolute: shifts.length ? Math.max(...shifts.map(Math.abs)) : null },
    }];
  }));
}
