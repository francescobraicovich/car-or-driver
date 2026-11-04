// Walk-forward backtesting: aggregate each weekend's pre-update forecast diagnostics.
export const NAIVE_LOGLOSS = Math.LN2;

function emptyAcc() {
  return {
    weekends: 0,
    raceObs: 0,
    raceW: 0,
    raceLoss: 0,
    raceBrier: 0,
    raceHits: 0,
    qualObs: 0,
    qualW: 0,
    qualLoss: 0,
    qualBrier: 0,
    qualHits: 0,
    preRaceW: 0,
    preRaceLoss: 0,
    preRaceBrier: 0,
    preRaceHits: 0,
  };
}

function finalize(a) {
  const raceLogLoss = a.raceW ? a.raceLoss / a.raceW : NaN;
  const qualLogLoss = a.qualW ? a.qualLoss / a.qualW : NaN;
  const preRaceLogLoss = a.preRaceW ? a.preRaceLoss / a.preRaceW : NaN;
  const totalWeight = a.raceW + a.qualW;
  const preWeight = a.preRaceW + a.qualW;
  return {
    ...a,
    raceLogLoss,
    raceBrier: a.raceW ? a.raceBrier / a.raceW : NaN,
    raceAcc: a.raceW ? a.raceHits / a.raceW : NaN,
    qualLogLoss,
    qualBrier: a.qualW ? a.qualBrier / a.qualW : NaN,
    qualAcc: a.qualW ? a.qualHits / a.qualW : NaN,
    combinedLogLoss: totalWeight ? (a.raceLoss + a.qualLoss) / totalWeight : NaN,
    preCombinedLogLoss: preWeight ? (a.preRaceLoss + a.qualLoss) / preWeight : NaN,
    preRaceLogLoss,
    raceSkill: Number.isFinite(raceLogLoss) ? 1 - raceLogLoss / NAIVE_LOGLOSS : NaN,
    qualSkill: Number.isFinite(qualLogLoss) ? 1 - qualLogLoss / NAIVE_LOGLOSS : NaN,
    totalWeight,
  };
}

function addScore(a, d, prefix, countKey, label) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new TypeError(`${label} must be an object`);
  if (!Number.isSafeInteger(d.obsCount) || d.obsCount < 0) throw new RangeError(`${label}.obsCount must be a nonnegative integer`);
  // Legacy no-qualifying weekends omit weight altogether.
  if (d.obsCount === 0 && d.weight === undefined) return;
  if (!Number.isFinite(d.weight) || d.weight < 0) throw new RangeError(`${label}.weight must be finite and nonnegative`);
  if (d.weight === 0) return;
  if (d.obsCount === 0) throw new RangeError(`${label} has positive weight but no observations`);
  for (const [name, value, max] of [
    ['logLoss', d.logLoss, Infinity],
    ['brier', d.brier, 1],
    ['acc', d.acc, 1],
  ])
    if (!Number.isFinite(value) || value < 0 || value > max) throw new RangeError(`${label}.${name} must be finite and in range`);
  if (countKey) a[countKey] += d.obsCount;
  a[`${prefix}W`] += d.weight;
  a[`${prefix}Loss`] += d.logLoss * d.weight;
  a[`${prefix}Brier`] += d.brier * d.weight;
  a[`${prefix}Hits`] += d.acc * d.weight;
}

const validYear = (year, side) =>
  (side === 'from' && year === -Infinity) || (side === 'to' && year === Infinity) || Number.isSafeInteger(year);

/** `diag` selects a diagnostic family; absent optional families are skipped. */
export function summarizeBacktest(model, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options must be an object');
  const { burnIn = 20, fromYear = -Infinity, toYear = Infinity, diag = 'diag' } = options;
  if (!Number.isSafeInteger(burnIn) || burnIn < 0) throw new RangeError('burnIn must be a nonnegative integer');
  if (!validYear(fromYear, 'from')) throw new RangeError('fromYear must be an integer or -Infinity');
  if (!validYear(toYear, 'to')) throw new RangeError('toYear must be an integer or Infinity');
  if (fromYear > toYear) throw new RangeError('fromYear must not exceed toYear');
  if (typeof diag !== 'string' || !diag.trim()) throw new TypeError('diag must be a nonempty string');
  const sourceSnaps = model?.snaps ?? [];
  if (!Array.isArray(sourceSnaps)) throw new TypeError('model.snaps must be an array');
  const snaps = [];
  for (const snap of sourceSnaps.slice(burnIn)) {
    if (!snap || typeof snap !== 'object' || !Number.isSafeInteger(snap.year))
      throw new TypeError('each selected snapshot must have an integer year');
    if (snap.year < fromYear || snap.year > toYear || snap[diag] === undefined) continue;
    if (!snap[diag] || typeof snap[diag] !== 'object' || Array.isArray(snap[diag]))
      throw new TypeError(`snapshot ${snap.year} ${diag} must be an object`);
    snaps.push(snap);
  }
  const perYear = new Map();
  const overall = emptyAcc();
  for (const snap of snaps) {
    const d = snap[diag];
    if (d.preWeight === undefined && [d.preLogLoss, d.preBrier, d.preAcc].some((value) => value !== undefined))
      throw new TypeError(`snapshot ${snap.year} ${diag} has pre-weekend metrics without preWeight`);
    if (!perYear.has(snap.year)) perYear.set(snap.year, { year: snap.year, ...emptyAcc() });
    const y = perYear.get(snap.year);
    for (const a of [y, overall]) {
      a.weekends++;
      addScore(a, d, 'race', 'raceObs', `snapshot ${snap.year} ${diag}`);
      if (d.preWeight !== undefined)
        addScore(
          a,
          { obsCount: d.obsCount, weight: d.preWeight, logLoss: d.preLogLoss, brier: d.preBrier, acc: d.preAcc },
          'preRace',
          null,
          `snapshot ${snap.year} ${diag} pre-weekend`,
        );
      if (d.q !== undefined) addScore(a, d.q, 'qual', 'qualObs', `snapshot ${snap.year} ${diag} qualifying`);
    }
  }
  return {
    burnIn,
    fromYear,
    toYear,
    weekends: snaps.length,
    seasons: [...perYear.values()].sort((a, b) => a.year - b.year).map((a) => ({ year: a.year, ...finalize(a) })),
    overall: finalize(overall),
  };
}

export function backtestObjective(summary) {
  return summary.overall.combinedLogLoss;
}

export function preWeekendObjective(summary) {
  return summary.overall.preCombinedLogLoss;
}
