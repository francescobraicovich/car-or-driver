// Compare fixed rating runs on dated observations. Slopes use only seasons preceding each validation block.
import { clusterBootstrap, nll } from './stats.js';
import { fitSlope, observationRows, reliability } from './predictive.js';

export const VALIDATION_FOLDS = Object.freeze([
  { from: 2008, to: 2011 },
  { from: 2012, to: 2015 },
  { from: 2016, to: 2020 },
  { from: 2021, to: 2025 },
]);

function validateRows(rows, label) {
  if (!rows.length) throw Error(`${label}: no observations`);
  for (const row of rows) {
    if (!Number.isInteger(row.year) || !Number.isFinite(row.z) || !Number.isFinite(row.w) || row.w <= 0 || ![0, 1].includes(row.o)) {
      throw Error(`${label}: invalid observation`);
    }
  }
}

function score(rows) {
  validateRows(rows, 'score');
  let weight = 0;
  let loss = 0;
  let brier = 0;
  let hits = 0;
  for (const row of rows) {
    const probability = 1 / (1 + Math.exp(-row.logit));
    weight += row.w;
    loss += row.w * nll(row.logit, row.o);
    brier += row.w * (probability - row.o) ** 2;
    hits += row.w * (probability === 0.5 ? 0.5 : Number(probability > 0.5 === !!row.o));
  }
  return { loss: loss / weight, brier: brier / weight, accuracy: hits / weight, weight, count: rows.length };
}

function slope(rows, label) {
  validateRows(rows, label);
  const value = fitSlope(rows);
  if (!Number.isFinite(value)) throw Error(`${label}: insufficient calibration observations`);
  return value;
}

/** moverRows[session][5|10] contains {items, stayers} from the strict frozen-mover protocol. */
export function chronologicalValidation(idx, runs, moverRows, folds = VALIDATION_FOLDS, { allowUnavailable = false } = {}) {
  if (!folds.length) throw Error('No validation folds');
  for (let i = 0; i < folds.length; i++) {
    const fold = folds[i];
    if (!Number.isInteger(fold.from) || !Number.isInteger(fold.to) || fold.from > fold.to || (i && fold.from <= folds[i - 1].to)) {
      throw Error('Validation folds must be ordered and disjoint');
    }
  }
  const forecasts = [];
  const movers = [];
  const summaries = [];
  for (const fold of folds) {
    const summary = { ...fold, calibrationThrough: fold.from - 1, sessions: {}, movers: {} };
    for (const session of ['race', 'qual']) {
      if (!runs[session] || runs[session].session !== session) throw Error(`Missing ${session} run`);
      const rows = observationRows(idx, runs[session]);
      validateRows(rows, session);
      const past = rows.filter((r) => r.year >= 2002 && r.year < fold.from);
      const allSlope = slope(past, `${session} calibration`);
      const fieldSlope = slope(
        past.filter((r) => !r.same),
        `${session} field calibration`,
      );
      const current = rows.filter((r) => r.year >= fold.from && r.year <= fold.to).map((r) => ({ ...r, logit: allSlope * r.z }));
      validateRows(current, `${session} validation`);
      forecasts.push(...current);
      const teammates = current.filter((r) => r.same);
      const validationSlope =
        current.length < 20 && allowUnavailable ? null : slope(current, `${session} validation calibration`) / allSlope;
      summary.sessions[session] = {
        slope: allSlope,
        fieldSlope,
        all: score(current),
        teammate: teammates.length ? score(teammates) : allowUnavailable ? null : score(teammates),
        calibration: { slope: validationSlope, ...reliability(current, allSlope) },
      };
      summary.movers[session] = {};
      for (const horizon of [5, 10]) {
        const source = moverRows[session]?.[horizon];
        if (!source) throw Error(`Missing ${session} mover observations at ${horizon}`);
        const stayers = source.stayers.filter((r) => r.year >= 2002 && r.year < fold.from);
        if (stayers.length) validateRows(stayers, `${session} stayer calibration`);
        const stayerSlope = stayers.length < 20 && allowUnavailable ? null : slope(stayers, `${session} stayer calibration`);
        const cells = {};
        for (const kind of ['tm', 'fd']) {
          const selected = source.items.filter(
            (r) =>
              r.kind === kind &&
              r.year >= fold.from &&
              r.year <= fold.to &&
              (r.observationYear ?? r.year) <= fold.to &&
              (r.eligibilityYear ?? r.year) <= fold.to,
          );
          if (selected.length) validateRows(selected, `${session} mover observations`);
          if (allowUnavailable && (!selected.length || (kind === 'tm' && stayerSlope === null))) {
            cells[kind] = null;
            continue;
          }
          const scored = selected.map((r) => ({ ...r, session, horizon, logit: r.z * (kind === 'tm' ? stayerSlope : fieldSlope) }));
          cells[kind] = score(scored);
          movers.push(...scored);
        }
        summary.movers[session][horizon] = { stayerSlope, teammate: cells.tm, field: cells.fd };
      }
    }
    summaries.push(summary);
  }
  return { folds: summaries, forecasts, movers };
}

/** Paired weighted loss difference (candidate minus reference), resampling seasons or moves. */
export function pairedDifference(reference, candidate, cluster, repetitions = 300) {
  if (reference.length !== candidate.length || !reference.length) throw Error('Paired observations do not match');
  const paired = reference.map((row, i) => {
    const other = candidate[i];
    for (const key of [
      'year',
      'observationYear',
      'eligibilityYear',
      'weekendIndex',
      'observationIndex',
      'i',
      'session',
      'horizon',
      'kind',
      'driverId',
      't0',
      'o',
      'w',
      'x',
      'y',
    ]) {
      if (row[key] !== other[key]) throw Error(`Paired observations differ at ${i}: ${key}`);
    }
    if (!Number.isFinite(row.logit) || !Number.isFinite(other.logit)) throw Error('Invalid paired prediction');
    return { ...row, difference: nll(other.logit, row.o) - nll(row.logit, row.o) };
  });
  return clusterBootstrap(
    paired,
    cluster,
    (rows) => rows.reduce((sum, r) => sum + r.w * r.difference, 0) / rows.reduce((sum, r) => sum + r.w, 0),
    { B: repetitions },
  );
}
