import { MODEL_SETTINGS } from '../../packages/core/src/presets/model-settings.js';

const median = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};

function select(selected, candidate) {
  const key = JSON.stringify([candidate.a, candidate.b, candidate.source]);
  const previous = selected.get(key);
  if (!previous || candidate.coverage > previous.coverage) selected.set(key, candidate);
  else if (candidate.coverage === previous.coverage && (candidate.outcome !== previous.outcome || candidate.margin !== previous.margin))
    previous.conflict = true;
}

// Normalize by the duration of the same overlapping windows used for pace.
function sharedDuration(first, second) {
  if (!first || !second) return null;
  const other = new Map(second.win.map((window) => [window.s, window]));
  let total = 0;
  let count = 0;
  for (const window of first.win) {
    const paired = other.get(window.s);
    if (window.n < 2 || !paired || paired.n < 2) continue;
    const weight = Math.min(window.n, paired.n);
    total += (weight * (window.med + paired.med)) / 2;
    count += weight;
  }
  return count >= 4 && total > 0 ? total / count : null;
}

/** Distinct teammate measurements, with original evidence exclusions intact. */
export function weekendMeasurements(weekend, lapPace) {
  const entrants = new Map(weekend.rows.map((row) => [String(row.driverId), String(row.constructorId)]));
  const selected = new Map();
  for (const { ob, session } of weekend.replayObs) {
    let a = String(ob.x.driverId),
      b = String(ob.y.driverId);
    if (a === b || !entrants.has(a) || !entrants.has(b) || entrants.get(a) !== entrants.get(b) || ![0, 1].includes(ob.obs)) continue;
    let outcome = 2 * ob.obs - 1;
    if (a > b) {
      [a, b] = [b, a];
      outcome = -outcome;
    }
    if (session === 'qual') {
      if (!['q1', 'q2', 'q3'].includes(ob.seg) || !(ob.tx > 0) || !(ob.ty > 0) || !Number.isFinite(ob.tx + ob.ty) || ob.tx === ob.ty)
        continue;
      select(selected, {
        a,
        b,
        session,
        source: 'qual',
        outcome,
        coverage: 1,
        margin: (outcome * 2 * Math.abs(ob.tx - ob.ty)) / (ob.tx + ob.ty),
      });
    } else if (session === 'race' && ['finish', 'paceW', 'partial'].includes(ob.source) && ob.base > 0 && Number.isFinite(ob.base)) {
      const coverage = ob.source === 'finish' ? 1 : Math.min(1, ob.base / (ob.source === 'paceW' ? MODEL_SETTINGS.paceW : 1));
      let margin = null;
      if (ob.source === 'paceW') {
        const pace = lapPace?.get(String(weekend.info.raceId));
        const duration = sharedDuration(pace?.get(a), pace?.get(b));
        if (duration && Number.isFinite(ob.gapSec) && ob.gapSec >= 0) margin = (outcome * ob.gapSec) / duration;
      }
      select(selected, { a, b, session, source: ob.source, outcome, coverage, margin });
    }
  }
  const pairs = new Map();
  for (const item of selected.values()) {
    if (item.conflict) continue;
    const key = JSON.stringify([item.a, item.b]);
    const pair = pairs.get(key) ?? {};
    pair[item.source] = item;
    pairs.set(key, pair);
  }
  return [...pairs.values()].flatMap((pair) => {
    const race = [pair.finish, pair.paceW].filter(Boolean);
    if (!race.length && pair.partial) race.push(pair.partial);
    const coverage = race.reduce((sum, item) => sum + item.coverage, 0);
    const budget = 1.5 * Math.max(0, ...race.map((item) => item.coverage));
    return [
      ...(pair.qual ? [{ ...pair.qual, weight: 1 }] : []),
      ...race.map((item) => ({ ...item, weight: (budget * item.coverage) / coverage })),
    ];
  });
}

/** Each observation retains the scale known at the beginning of its season. */
export function jointEvidence(weekends, lapPace) {
  const groups = new Map();
  let year = null,
    scales = {};
  return weekends.map((weekend) => {
    const nextYear = Number(weekend.info.year);
    if (year !== null && nextYear < year) throw new RangeError('Evidence must be chronological');
    if (nextYear !== year) {
      scales = {};
      for (const source of ['qual', 'paceW']) {
        const residuals = [...groups.values()]
          .filter((group) => group.source === source && group.values.length >= 3)
          .flatMap((group) => {
            const center = median(group.values);
            return group.values.map((value) => Math.abs(value - center));
          });
        const scale = residuals.length >= 20 ? median(residuals) / Math.log(3) : null;
        if (scale > 0 && Number.isFinite(scale)) scales[source] = scale;
      }
      year = nextYear;
    }
    const observations = weekendMeasurements(weekend, lapPace).map((item) => {
      const scale = scales[item.source];
      const continuous = Number.isFinite(item.margin) && scale > 0;
      if (Number.isFinite(item.margin)) {
        const key = JSON.stringify([year, item.a, item.b, item.source]);
        const group = groups.get(key) ?? { source: item.source, values: [] };
        group.values.push(item.margin);
        groups.set(key, group);
      }
      return { ...item, kind: continuous ? 'margin' : 'binary', target: continuous ? item.margin / scale : (item.outcome + 1) / 2 };
    });
    return {
      raceId: String(weekend.info.raceId),
      date: weekend.info.date,
      year,
      entries: [...new Set(weekend.rows.map((row) => String(row.driverId)))],
      scales: { ...scales },
      observations,
    };
  });
}
