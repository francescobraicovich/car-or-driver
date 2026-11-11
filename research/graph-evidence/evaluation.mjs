import { indexTimeline, findMoves } from '../../packages/eval/src/events.js';
import { logisticCalibration, nll } from '../../packages/eval/src/stats.js';
import { fitSlope } from '../../packages/eval/src/predictive.js';
import { strictItems, strictStayers } from '../../packages/research/node/mover-strict.mjs';
import { VALIDATION_FOLDS } from '../../packages/eval/src/chronological-validation.js';
import { moverReport, forecastReport, stabilityReport } from '../stable-ratings/metrics.mjs';

const POINTS = 75 / Math.LN10;
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const centered = (ids, values) => {
  const mean = average(values);
  return new Map(ids.map((id, index) => [id, values[index] - mean]));
};

export function gapVariance(snapshot, session, a, b) {
  const first = snapshot.ids.indexOf(a),
    second = snapshot.ids.indexOf(b);
  const matrix = snapshot.covariance[session];
  if (first < 0 || second < 0 || !matrix) throw Error('Missing pair covariance');
  const variance = matrix[first][first] + matrix[second][second] - 2 * matrix[first][second];
  if (!Number.isFinite(variance) || variance < -1e-8) throw Error('Invalid gap variance');
  return Math.max(0, variance);
}

const uncertainLogit = (value, variance) => value / Math.sqrt(1 + (Math.PI * variance) / 8);

export function graphRuns(timeline, history) {
  if (timeline.length !== history.length) throw Error('Graph and evaluation history differ');
  return Object.fromEntries(
    ['race', 'qual'].map((session) => [
      session,
      {
        session,
        k: 1 / POINTS,
        pre: history.map((snapshot, index) => {
          const weekend = timeline[index];
          const ids = [
            ...new Set([
              ...weekend.rows.map((row) => row.driverId),
              ...weekend.obs[session].flatMap((observation) => [observation.x, observation.y]),
            ]),
          ];
          const rated = centered(
            ids,
            ids.map((id) => snapshot.pre.levels[session][snapshot.pre.ids.indexOf(id)]),
          );
          const cars = new Map([
            ...weekend.rows.map((row) => [row.constructorId, 0]),
            ...weekend.obs[session].flatMap((observation) => [
              [observation.cx, 0],
              [observation.cy, 0],
            ]),
          ]);
          return { rated, drivers: rated, cars };
        }),
        post: history.map((snapshot) => ({
          drivers: new Map([...centered(snapshot.post.ids, snapshot.post.levels[session])].map(([id, m]) => [id, { m, seen: true }])),
        })),
      },
    ]),
  );
}

function calibrated(rows) {
  const value = fitSlope(rows);
  if (!Number.isFinite(value)) throw Error('Insufficient calibration evidence');
  return value;
}

export function summarize(rows) {
  if (!rows.length) return null;
  let weight = 0,
    loss = 0,
    brier = 0,
    unweighted = 0,
    correct = 0;
  for (const row of rows) {
    const probability = 1 / (1 + Math.exp(-row.logit));
    const error = nll(row.logit, row.o);
    weight += row.w;
    loss += row.w * error;
    unweighted += error;
    brier += row.w * (probability - row.o) ** 2;
    correct += row.w * (probability === 0.5 ? 0.5 : Number(probability > 0.5 === Boolean(row.o)));
  }
  return {
    count: rows.length,
    weight,
    loss: loss / weight,
    unweightedLoss: unweighted / rows.length,
    brier: brier / weight,
    accuracy: correct / weight,
    calibrationSlope:
      rows.length >= 5
        ? logisticCalibration(
            rows.map((row) => row.logit),
            rows.map((row) => row.o),
            rows.map((row) => row.w),
            { intercept: false },
          ).b
        : null,
  };
}

function stayerRows(idx, run, history, horizon, uncertainty) {
  const result = [];
  idx.timeline.forEach((weekend, index) => {
    const frozen = index - (index % horizon);
    for (const observation of weekend.obs[run.session]) {
      const { x, y, same, o, w } = observation;
      if (!same || !(idx.tenure[frozen].get(x) >= 10 && idx.tenure[frozen].get(y) >= 10)) continue;
      if (idx.teamAt[frozen].get(x) !== idx.teamAt[index].get(x) || idx.teamAt[frozen].get(y) !== idx.teamAt[index].get(y)) continue;
      const z = (run.pre[frozen].rated.get(x) - run.pre[frozen].rated.get(y)) / POINTS;
      if (!Number.isFinite(z)) continue;
      result.push({
        year: weekend.year,
        z: uncertainty ? uncertainLogit(z, gapVariance(history[frozen].pre, run.session, x, y)) : z,
        o,
        w,
      });
    }
  });
  // Guard the local covariance extension against divergence from the shared protocol.
  if (!uncertainty) {
    const expected = strictStayers(idx, run, horizon);
    if (
      expected.length !== result.length ||
      expected.some((row, index) => Math.abs(row.z - result[index].z) > 1e-12 || row.w !== result[index].w || row.o !== result[index].o)
    )
      throw Error('Frozen stayer protocol differs');
  }
  return result;
}

/** Teammate-only scoring, using the unchanged observation and mover definitions. */
export function evaluateGraph(env, history, { uncertainty = false, folds = VALIDATION_FOLDS } = {}) {
  const timeline = env.timeline.slice(0, history.length),
    idx = indexTimeline(timeline, env.prep.ctx),
    moves = findMoves(idx);
  const moveMap = new Map(moves.map((move) => [`${move.driverId}:${move.t0}`, move]));
  const runs = graphRuns(timeline, history);
  const forecasts = [],
    moverRows = [],
    summaries = [],
    omissions = {};
  for (const session of ['race', 'qual']) {
    const run = runs[session];
    const ordinary = timeline.flatMap((weekend, index) =>
      weekend.obs[session].flatMap((observation, observationIndex) => {
        if (!observation.same) return [];
        const { x, y, o, w, src } = observation;
        const z = (run.pre[index].rated.get(x) - run.pre[index].rated.get(y)) / POINTS;
        if (!Number.isFinite(z)) throw Error(`Missing ordinary rating at ${weekend.raceId} for ${x}/${y} (${session})`);
        return [
          {
            year: weekend.year,
            i: index,
            observationIndex,
            session,
            x,
            y,
            o,
            w,
            src,
            same: true,
            z: uncertainty ? uncertainLogit(z, gapVariance(history[index].pre, session, x, y)) : z,
          },
        ];
      }),
    );
    const frozen = Object.fromEntries(
      [5, 10].map((horizon) => {
        const all = strictItems(idx, run, moves, horizon);
        omissions[`${session}.${horizon}`] = all.omitted;
        const items = all
          .filter((row) => row.kind === 'tm')
          .map((row) => {
            if (!uncertainty) return row;
            const observation = timeline[row.weekendIndex].obs[session][row.observationIndex];
            const move = moveMap.get(`${row.driverId}:${row.t0}`);
            return { ...row, z: uncertainLogit(row.z, gapVariance(history[move.ell].pre, session, observation.x, observation.y)) };
          });
        return [horizon, { items, stayers: stayerRows(idx, run, history, horizon, uncertainty) }];
      }),
    );
    for (const fold of folds) {
      const slope = calibrated(ordinary.filter((row) => row.year >= 2002 && row.year < fold.from));
      const rows = ordinary.filter((row) => row.year >= fold.from && row.year <= fold.to).map((row) => ({ ...row, logit: slope * row.z }));
      forecasts.push(...rows);
      summaries.push({
        ...fold,
        session,
        calibrationThrough: fold.from - 1,
        slope,
        all: summarize(rows),
        sources: Object.fromEntries(
          ['finish', 'paceW', 'partial', 'qual'].map((source) => [source, summarize(rows.filter((row) => row.src === source))]),
        ),
      });
      for (const horizon of [5, 10]) {
        const stayerSlope = calibrated(frozen[horizon].stayers.filter((row) => row.year >= 2002 && row.year < fold.from));
        moverRows.push(
          ...frozen[horizon].items
            .filter(
              (row) => row.year >= fold.from && row.year <= fold.to && row.observationYear <= fold.to && row.eligibilityYear <= fold.to,
            )
            .map((row) => ({ ...row, session, horizon, logit: stayerSlope * row.z })),
        );
      }
    }
  }
  // Stable identity order for paired comparisons and the existing move-balanced metric.
  const order = (a, b) =>
    a.year - b.year ||
    a.session.localeCompare(b.session) ||
    (a.horizon ?? 0) - (b.horizon ?? 0) ||
    (a.i ?? a.weekendIndex) - (b.i ?? b.weekendIndex) ||
    a.observationIndex - b.observationIndex ||
    String(a.driverId).localeCompare(String(b.driverId));
  forecasts.sort(order);
  moverRows.sort(order);
  const combined = {
    pre: runs.race.pre.map((snapshot, index) => ({
      rated: new Map([...snapshot.rated].map(([id, value]) => [id, 0.5 * value + 0.5 * runs.qual.pre[index].rated.get(id)])),
    })),
    post: runs.race.post.map((snapshot, index) => ({
      drivers: new Map(
        [...snapshot.drivers].map(([id, value]) => [id, { m: 0.5 * value.m + 0.5 * runs.qual.post[index].drivers.get(id).m, seen: true }]),
      ),
    })),
  };
  return {
    forecasts,
    movers: moverRows,
    folds: summaries,
    omissions,
    pooled: Object.fromEntries(['race', 'qual'].map((session) => [session, summarize(forecasts.filter((row) => row.session === session))])),
    sources: Object.fromEntries(
      ['finish', 'paceW', 'partial', 'qual'].map((source) => [source, summarize(forecasts.filter((row) => row.src === source))]),
    ),
    stability: stabilityReport(idx, combined, { from: folds[0].from, to: folds.at(-1).to, bootstrap: { B: 0 } }),
  };
}

export function compareGraphs(reference, candidate, folds = VALIDATION_FOLDS) {
  if (JSON.stringify(reference.omissions) !== JSON.stringify(candidate.omissions)) throw Error('Mover omissions differ');
  const movers = moverReport(reference, candidate, { folds, bootstrap: { B: 1000 } });
  const forecasts = forecastReport(reference, candidate, { folds, bootstrapRepetitions: 1000 });
  const ordinary =
    ['race', 'qual'].every((session) => candidate.pooled[session].loss - reference.pooled[session].loss <= 0.003) &&
    candidate.folds.every((fold, index) => !fold.all || fold.all.loss - reference.folds[index].all.loss <= 0.006);
  const movement = (evaluation) => evaluation.stability.postToPost.normalizedByFieldSpread.categories.all.p90;
  const movementRatio = movement(candidate) / movement(reference);
  const difference = movers.pooled.primary.difference;
  const primary = movers.pooled.primary.candidate < movers.pooled.primary.reference && difference.hi < 0;
  return {
    movers,
    forecasts,
    movementRatio,
    guards: { primary, ordinary, stability: movementRatio <= 1.1 },
    pass: primary && ordinary && movementRatio <= 1.1,
  };
}
