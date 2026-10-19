// What each headline metric means, what a good value is, and how to read it against its synthetic null.
//
// `kind` decides the verdict:
//   bias    should equal the null (a correctly specified world's value, or `target` if none was run)
//   slope1  a calibration slope: should be about 1 (and, for movers, close to the stayers' slope)
//   ratio   a size relative to stable entities: should equal the null
//   lower   a score: lower is better, no verdict (read it against another model with --compare)
//   info    reported, no verdict
// A verdict is "ok" when the 95% interval of the real value contains the reference, otherwise "high" or "low".
const S = (s) => (s === 'race' ? 'race' : 'qualifying');
const rules = [
  // ---- predictive
  [
    /^predictive\.loss\.(\w+)\.(\w+)\.(\w+)$/,
    (m) => ({ label: `Log-loss, ${m[1]}, ${m[2]} pairs, ${WIN[m[3]] ?? m[3]}`, kind: 'lower', group: 'Predictive' }),
  ],
  [
    /^predictive\.walkForward\.(\w+)\.(\w+)$/,
    (m) => ({ label: `Log-loss with a walk-forward multiplier, ${S(m[1])}, ${WIN[m[2]] ?? m[2]}`, kind: 'lower', group: 'Predictive' }),
  ],
  [
    /^predictive\.calSlope\.(\w+)\.(\w+)$/,
    (m) => ({ label: `Calibration slope, ${S(m[1])}, ${m[2]}`, kind: 'slope1', target: 1, group: 'Predictive' }),
  ],
  [/^predictive\.ece\.(\w+)$/, (m) => ({ label: `Expected calibration error, ${S(m[1])}`, kind: 'lower', group: 'Predictive' })],
  [
    /^forecast\.(\w+)\.(\w+)\.(\w+)$/,
    (m) => ({
      label: `Forecast layer (${m[1]} inputs), ${FORECAST[m[2]] || m[2]}, ${WIN[m[3]] ?? m[3]}`,
      kind: 'lower',
      group: 'Forecast layer',
    }),
  ],
  // ---- property 1: movers
  [
    /^movers\.(\w+)\.step\.k(\d+)\.mean$/,
    (m) => ({ label: `Mover rating step after ${m[2]} races, mean (points)`, kind: 'bias', target: 0, group: `1. Movers (${S(m[1])})` }),
  ],
  [
    /^movers\.(\w+)\.step\.k(\d+)\.rmsRatio$/,
    (m) => ({ label: `Mover step after ${m[2]} races, size vs stable drivers`, kind: 'ratio', target: 1, group: `1. Movers (${S(m[1])})` }),
  ],
  [
    /^movers\.(\w+)\.leak\.k(\d+)$/,
    (m) => ({
      label: `Mover step on car-strength change, slope, ${m[2]} races (0 = no leak)`,
      kind: 'bias',
      target: 0,
      group: `1. Movers (${S(m[1])})`,
    }),
  ],
  [
    /^movers\.(\w+)\.frozenSlope\.k(\d+)$/,
    (m) => ({
      label: `Frozen-rating duel calibration vs new teammate, first ${m[2]} races (movers)`,
      kind: 'slope1',
      target: 1,
      group: `1. Movers (${S(m[1])})`,
    }),
  ],
  [
    /^movers\.(\w+)\.frozenSlopeStayers\.k(\d+)$/,
    (m) => ({ label: `... same forecast for teammates who stayed, ${m[2]}`, kind: 'slope1', target: 1, group: `1. Movers (${S(m[1])})` }),
  ],
  [
    /^movers\.(\w+)\.frozenLoss\.k(\d+)$/,
    (m) => ({ label: `Frozen-rating duel log-loss, ${m[2]} races (coin flip 0.693)`, kind: 'lower', group: `1. Movers (${S(m[1])})` }),
  ],
  [
    /^movers\.(\w+)\.onlineLoss\.k(\d+)$/,
    (m) => ({ label: `Online forecast of the same duels, ${m[2]} races`, kind: 'lower', group: `1. Movers (${S(m[1])})` }),
  ],
  // ---- property 2: teammates of movers
  [
    /^teammates\.(\w+)\.step\.k(\d+)\.mean$/,
    (m) => ({
      label: `Stayer's rating step after ${m[2]} races with a new teammate, mean (points)`,
      kind: 'bias',
      target: 0,
      group: `2. Teammates of movers (${S(m[1])})`,
    }),
  ],
  [
    /^teammates\.(\w+)\.step\.k(\d+)\.rmsRatio$/,
    (m) => ({
      label: `Stayer's step after ${m[2]} races, size vs stable drivers`,
      kind: 'ratio',
      target: 1,
      group: `2. Teammates of movers (${S(m[1])})`,
    }),
  ],
  [
    /^teammates\.(\w+)\.leak\.k(\d+)$/,
    (m) => ({
      label: `Stayer's step on (incoming - replaced) strength, slope, ${m[2]} races`,
      kind: 'bias',
      target: 0,
      group: `2. Teammates of movers (${S(m[1])})`,
    }),
  ],
  [
    /^teammates\.(\w+)\.alloc\.(\w+)$/,
    (m) => ({
      label: `Share of the pair's gap revision that lands on the ${m[2]}${m[2] === 'car' ? '' : ' (mover - mate = 1)'}`,
      kind: 'bias',
      target: m[2] === 'car' ? 0 : NaN,
      group: `2. Teammates of movers (${S(m[1])})`,
    }),
  ],
  // ---- property 3: shocks
  [
    /^shocks\.(\w+)\.leak\.(\w+)$/,
    (m) => ({
      label: `Driver rating change on car rating change, slope: ${LEAK[m[2]] || m[2]}`,
      kind: 'bias',
      target: 0,
      group: `3. Car shocks (${S(m[1])})`,
    }),
  ],
  [
    /^shocks\.(\w+)\.leakFree\.(\w+)$/,
    (m) => ({
      label: `Driver rating change on OBSERVED team performance change, slope: ${LEAK[m[2]] || m[2]}`,
      kind: 'bias',
      target: 0,
      group: `3. Car shocks (${S(m[1])})`,
    }),
  ],
  [
    /^shocks\.(\w+)\.driverRmsRatioReg$/,
    (m) => ({
      label: 'Driver rating change, regulation winters vs normal (rms ratio)',
      kind: 'ratio',
      target: 1,
      group: `3. Car shocks (${S(m[1])})`,
    }),
  ],
  [
    /^shocks\.(\w+)\.carRmsRatioReg$/,
    (m) => ({
      label: 'Car rating change, regulation winters vs normal (rms ratio, shows the shock exists)',
      kind: 'info',
      group: `3. Car shocks (${S(m[1])})`,
    }),
  ],
  [
    /^shocks\.(\w+)\.gapVolatility$/,
    (m) => ({
      label: 'Teammate gap change on |car change|, slope (0 = gap not shaken by the car)',
      kind: 'bias',
      target: 0,
      group: `3. Car shocks (${S(m[1])})`,
    }),
  ],
  // ---- health
  [
    /^health\.(\w+)\.efficiency\.(\w+)$/,
    (m) => ({
      label: `Next revision on last revision, ${m[2]} (0 = updates unpredictable)`,
      kind: 'bias',
      target: 0,
      group: `Health (${S(m[1])})`,
    }),
  ],
  [
    /^health\.(\w+)\.uncertainty\.(\w+)\.z2$/,
    (m) => ({
      label: `Squared standardised 6-race revision, ${m[2]} (1 = bars right)`,
      kind: 'ratio',
      target: 1,
      group: `Health (${S(m[1])})`,
    }),
  ],
  [
    /^health\.(\w+)\.uncertainty\.(\w+)\.cover90$/,
    (m) => ({ label: `Share of ${m[2]} revisions inside the 90% bar`, kind: 'ratio', target: 0.9, group: `Health (${S(m[1])})` }),
  ],
  [
    /^health\.(\w+)\.widening\.(\w+)$/,
    (m) => ({
      label: `Error bar of ${WHO[m[2]] ?? m[2]} vs typical (should widen where less is known)`,
      kind: 'info',
      group: `Health (${S(m[1])})`,
    }),
  ],
  // ---- rookies
  [
    /^rookies\.(\w+)\.bias\.(\w+)$/,
    (m) => ({ label: `Rookie duels, ${m[2]}: mean (outcome - forecast)`, kind: 'bias', target: 0, group: `Rookies (${S(m[1])})` }),
  ],
  [
    /^rookies\.(\w+)\.slope\.(\w+)$/,
    (m) => ({ label: `Rookie duels, ${m[2]}: calibration slope`, kind: 'slope1', target: 1, group: `Rookies (${S(m[1])})` }),
  ],
  [
    /^rookies\.(\w+)\.curve\.k(\d+)$/,
    (m) => ({
      label: `Rookie rating after ${m[2]} races minus after 40 (points; rookies who lasted 40 races)`,
      kind: 'bias',
      target: 0,
      group: `Rookies (${S(m[1])})`,
    }),
  ],
  [
    /^rookies\.(\w+)\.leak$/,
    (m) => ({ label: 'Car change on rookie rating change over 5 races, slope', kind: 'bias', target: 0, group: `Rookies (${S(m[1])})` }),
  ],
  // ---- synthetic truth
  [
    /^truth\.(\w+)\.rmse(\w+)$/,
    (m) => ({
      label: `Recovery error, ${m[2].toLowerCase()} rating (points)`,
      kind: 'lower',
      group: `Recovery on synthetic worlds (${S(m[1])})`,
    }),
  ],
  [
    /^truth\.(\w+)\.gapRmse\.(\w+)$/,
    (m) => ({ label: `Forecast error of the ${m[2]} gap (points)`, kind: 'lower', group: `Recovery on synthetic worlds (${S(m[1])})` }),
  ],
  [
    /^truth\.(\w+)\.z2\.(\w+)$/,
    (m) => ({
      label: `Squared error / sd, ${m[2]} (1 = bars right)`,
      kind: 'ratio',
      target: 1,
      group: `Recovery on synthetic worlds (${S(m[1])})`,
    }),
  ],
  [
    /^truth\.(\w+)\.cover90\.(\w+)$/,
    (m) => ({ label: `Truth inside the 90% bar, ${m[2]}`, kind: 'ratio', target: 0.9, group: `Recovery on synthetic worlds (${S(m[1])})` }),
  ],
  [
    /^truth\.(\w+)\.leakTruth\.(\w+)$/,
    (m) => ({
      label: `Leak against the TRUE car swing, ${LEAK[m[2]] || m[2]} (0 = none)`,
      kind: 'bias',
      target: 0,
      group: 'Recovery on synthetic worlds',
    }),
  ],
  [
    /^truth\.(\w+)\.carCapture$/,
    (m) => ({
      label: 'Share of a true winter car swing the car estimate captures',
      kind: 'info',
      group: `Recovery on synthetic worlds (${S(m[1])})`,
    }),
  ],
  [
    /^truth\.(\w+)\.moverStepBias$/,
    (m) => ({
      label: 'Mover step minus true change over 5 races (points)',
      kind: 'bias',
      target: 0,
      group: `Recovery on synthetic worlds (${S(m[1])})`,
    }),
  ],
];
const WIN = { fit: '2002-2007', w2: '2008-2011', w3: '2012-2015', holdout: '2016+' };
const WHO = { mover: 'a mover', rookie: 'a rookie', carRegYear: 'a car in a regulation year' };
const FORECAST = { raceDay: 'race-day (race and qualifying combined)', thursday: 'Thursday (combined, no grid)', qual: 'qualifying head' };
const LEAK = {
  winterUnchanged: 'winter, lineup unchanged',
  winterJoined: 'winter, a driver joined',
  winterReg: 'winter, regulation change',
  winterNormal: 'winter, no regulation change',
  season: 'in-season windows',
};

/** Order of the groups in a report. */
export const groupOrder = (g) => {
  const order = ['Predictive', 'Forecast layer', '1.', '2.', '3.', 'Health', 'Rookies', 'Recovery'];
  const i = order.findIndex((p) => g.startsWith(p));
  return (i < 0 ? order.length : i) * 10 + (g.includes('(race)') ? 0 : 1);
};

/** The description of a headline key, or null. */
export function describe(key) {
  for (const [re, f] of rules) {
    const m = key.match(re);
    if (m) return f(m);
  }
  return null;
}

/**
 * Read a real estimate { est, lo, hi } against a reference value (the synthetic null if there is one, else the target).
 * @returns {'ok'|'high'|'low'|''}
 */
export function verdict(kind, est, ref) {
  if (!['bias', 'slope1', 'ratio'].includes(kind) || !est || !Number.isFinite(est.est) || !Number.isFinite(ref)) return '';
  if (!Number.isFinite(est.lo)) return '';
  if (est.lo > ref) return 'high';
  if (est.hi < ref) return 'low';
  return 'ok';
}
