// Backward elimination of nuisance terms from the production ranking learner.
// Every candidate retains both state-space filters and the published blend.
import { stateSpaceRun } from '../../packages/eval/src/adapters.js';
import { qualLink } from '../../packages/core/src/state-space/qualifying-link.js';
// Full original filter settings are frozen independently of the live presets.
export const ORIGINAL_FILTER = Object.freeze({
  "race": {
    "sdD": 20,
    "sdNew": 9.103322712790167,
    "sdC": 26.923076923076923,
    "rho": 0.7999999999999999,
    "winterC": 8.753194916144391,
    "raceC": 0.9103322712790167,
    "yearD": 3.846153846153846,
    "raceD": 0,
    "tau": 0.038461538461538464,
    "thetaT": 2.7439999999999993,
    "mPace": 25.62890625,
    "mPart": 38.443359375,
    "s": 75,
    "iters": 3,
    "shrinkM": 1,
    "sdJ": 5,
    "sdA": 12,
    "rhoA": 0.97,
    "relStart": 0,
    "muNew": 0,
    "sdR": 0,
    "dipR": 0,
    "rhoR": 0.85,
    "sdRel": 0,
    "muRel": 0,
    "rookieN": 5,
    "mRookieCross": 1,
    "varInfl": 8.55,
    "varInflPred": 1,
    "sdCL": 0,
    "carShrinkL": 1,
    "tauWet": 1,
    "mMover": 1,
    "moverN": 5,
    "rateA": false,
    "lambdaD": 1
  },
  "qual": {
    "sdD": 20,
    "sdNew": 33.800000000000004,
    "sdC": 59.15,
    "rho": 1,
    "winterC": 32.5,
    "raceC": 5.712200000000002,
    "yearD": 8.450000000000001,
    "raceD": 0,
    "tau": 0.06999999999999999,
    "thetaT": 2.7439999999999993,
    "mPace": 1,
    "mPart": 1,
    "s": 75,
    "iters": 3,
    "shrinkM": 1,
    "sdJ": 30,
    "sdA": 0,
    "rhoA": 0.8,
    "relStart": 0,
    "muNew": 0,
    "sdR": 6.5536,
    "dipR": 45,
    "rhoR": 0.85,
    "sdRel": 0,
    "muRel": 0,
    "rookieN": 5,
    "mRookieCross": 1,
    "varInfl": 1,
    "varInflPred": 1,
    "sdCL": 0,
    "carShrinkL": 1,
    "tauWet": 1,
    "mMover": 1,
    "moverN": 5,
    "rateA": true,
    "lambdaD": 1
  }
});
const ROUNDED_FILTER = Object.freeze({
  race: { ...ORIGINAL_FILTER.race, sdNew: 9, sdC: 27, rho: 0.8, winterC: 9, raceC: 1, yearD: 4, tau: 0.04, thetaT: 2.75, mPace: 25, mPart: 40 },
  qual: { ...ORIGINAL_FILTER.qual, sdNew: 34, sdC: 60, winterC: 33, raceC: 6, yearD: 8.5, tau: 0.07, thetaT: 2.75, sdR: 6.5 },
});
// Frozen reference settings from the original published hybrid.
const HYBRID = Object.freeze({
  qualifyingDriverShare: 0.4, rankingDriverShare: 0.2, qualifyingCarShare: 0.25,
  ranking: Object.freeze({ learningRate: 180, teammateWeight: 2, fitPenalty: 0.15, levelPenalty: 0.001,
    carWinterRetention: 0.8, driverWinterRetention: 0.95 }),
});

const k = Math.LN10 / 75;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const sigmoid = (value) => 1 / (1 + Math.exp(-clamp(value, -30, 30)));
const center = (map) => {
  const mean = [...map.values()].reduce((sum, value) => sum + value, 0) / map.size;
  return new Map([...map].map(([id, value]) => [id, value - mean]));
};
function ranking(timeline, carOf, { wet = true, fit = true, shrink = true, separateWinter = true, learningRate = HYBRID.ranking.learningRate }) {
  const settings = HYBRID.ranking, values = new Map(), pre = [], post = [];
  const get = (key) => values.get(key) ?? 0;
  let priorYear = null;
  for (const weekend of timeline) {
    if (priorYear !== null && weekend.year !== priorYear) for (const [key, value] of values) {
      const retention = key.startsWith('fit:') ? 0.4 : key.startsWith('car:') && separateWinter ? settings.carWinterRetention : settings.driverWinterRetention;
      values.set(key, value * retention);
    }
    priorYear = weekend.year;
    const drivers = new Map();
    const include = (driver) => drivers.set(driver, get(`driver:${driver}`));
    for (const row of weekend.rows) include(String(row.driverId));
    for (const observation of [...weekend.obs.race, ...weekend.obs.qual]) { include(observation.x); include(observation.y); }
    pre.push(drivers);
    const features = (observation) => [
      [`driver:${observation.x}`, 1], [`driver:${observation.y}`, -1],
      [`car:${carOf(observation.cx)}`, 1], [`car:${carOf(observation.cy)}`, -1],
      ...(fit ? [[`fit:${observation.x}:${carOf(observation.cx)}`, 1], [`fit:${observation.y}:${carOf(observation.cy)}`, -1]] : []),
      ...(wet && weekend.wet ? [[`wet-driver:${observation.x}`, 1], [`wet-driver:${observation.y}`, -1]] : []),
    ];
    const weight = weekend.obs.race.reduce((sum, observation) => sum + observation.w * (observation.same ? settings.teammateWeight : 1), 0);
    const gradient = new Map();
    for (const observation of weekend.obs.race) {
      const terms = features(observation);
      const probability = sigmoid(k * terms.reduce((sum, [key, coefficient]) => sum + coefficient * get(key), 0));
      const error = observation.w * (observation.same ? settings.teammateWeight : 1) * (observation.o - probability) / weight;
      for (const [key, coefficient] of terms) gradient.set(key, (gradient.get(key) ?? 0) + error * coefficient);
    }
    for (const [key, amount] of gradient) {
      const penalty = key.startsWith('fit:') ? settings.fitPenalty : shrink ? settings.levelPenalty : 0;
      values.set(key, clamp((1 - penalty) * get(key) + learningRate * amount, -200, 200));
    }
    post.push(new Map(weekend.rows.map((row) => [String(row.driverId), get(`driver:${row.driverId}`)])));
  }
  return { pre, post };
}
function hybrid(env, options, filter = ORIGINAL_FILTER, blend = HYBRID, link = { beta: 0.4, gamma: 0.3 }) {
  const { timeline, prep } = env;
  const qual = stateSpaceRun(timeline, 'qual', prep.ctx, filter.qual);
  const race = stateSpaceRun(timeline, 'race', { ...prep.ctx, ...qualLink(qual.raw, link.beta, link.gamma) }, filter.race);
  const ranked = ranking(timeline, prep.ctx.carOf, options);
  const pre = [], post = [], z = [];
  for (const [i, weekend] of timeline.entries()) {
    const old = race.pre[i], other = qual.pre[i], rank = ranked.pre[i];
    const driverDelta = (id) => {
      const base = old.rated.get(id);
      const first = base + blend.qualifyingDriverShare * ((other.rated.get(id) ?? base) - base);
      return first + blend.rankingDriverShare * ((rank.get(id) ?? first) - first) - base;
    };
    const carDelta = (id) => blend.qualifyingCarShare * ((other.cars.get(id) ?? old.cars.get(id)) - old.cars.get(id));
    pre.push({ ...old,
      rated: center(new Map([...old.rated].map(([id, value]) => [id, value + driverDelta(id)]))),
      drivers: center(new Map([...old.drivers].map(([id, value]) => [id, value + driverDelta(id)]))),
      cars: center(new Map([...old.cars].map(([id, value]) => [id, value + carDelta(id)]))),
    });
    const oldPost = race.post[i], qualPost = qual.post[i];
    const blendPost = (kind, id, value) => {
      const otherValue = qualPost[kind].get(id)?.m ?? value;
      if (kind === 'cars') return value + blend.qualifyingCarShare * (otherValue - value);
      const first = value + blend.qualifyingDriverShare * (otherValue - value);
      return first + blend.rankingDriverShare * ((ranked.post[i].get(id) ?? first) - first);
    };
    const postKind = (kind) => {
      const means = center(new Map([...oldPost[kind]].map(([id, value]) => [id, blendPost(kind, id, value.m)])));
      return new Map([...oldPost[kind]].map(([id, value]) => [id, { ...value, m: means.get(id) }]));
    };
    post.push({ drivers: postKind('drivers'), cars: postKind('cars') });
    const plain = Float64Array.from(race.z[i].plain, (value, j) => {
      const observation = weekend.obs.race[j];
      return value + k * (driverDelta(observation.x) - driverDelta(observation.y) + carDelta(observation.cx) - carDelta(observation.cy));
    });
    const vari = race.z[i].vari;
    z.push({ plain, vari, adj: Float64Array.from(plain, (value, j) => value / Math.sqrt(1 + Math.PI / 8 * k * k * vari[j])) });
  }
  return { race: { ...race, pre, post, z }, qual };
}
export const rankingCandidates = Object.freeze({
  control: (env) => hybrid(env, {}),
  'ranking-without-wet': (env) => hybrid(env, { wet: false }),
  'ranking-without-fit': (env) => hybrid(env, { fit: false }),
  'ranking-without-shrink': (env) => hybrid(env, { shrink: false }),
  'ranking-common-winter': (env) => hybrid(env, { separateWinter: false }),
  'ranking-without-nuisance': (env) => hybrid(env, { wet: false, fit: false, shrink: false, separateWinter: false }),
  'rounded-filter': (env) => hybrid(env, { wet: false, fit: false, shrink: false, separateWinter: false }, ROUNDED_FILTER),
  'without-qualifying-driver-blend': (env) => hybrid(env, { wet: false, fit: false, shrink: false, separateWinter: false }, ROUNDED_FILTER, { ...HYBRID, qualifyingDriverShare: 0 }),
  'without-qualifying-car-blend': (env) => hybrid(env, { wet: false, fit: false, shrink: false, separateWinter: false }, ROUNDED_FILTER, { ...HYBRID, qualifyingCarShare: 0 }),
  'without-qualifying-driver-link': (env) => hybrid(env, { wet: false, fit: false, shrink: false, separateWinter: false }, ROUNDED_FILTER, HYBRID, { beta: 0, gamma: 0.3 }),
  'without-qualifying-car-link': (env) => hybrid(env, { wet: false, fit: false, shrink: false, separateWinter: false }, ROUNDED_FILTER, HYBRID, { beta: 0.4, gamma: 0 }),
  'without-qualifying-links': (env) => hybrid(env, { wet: false, fit: false, shrink: false, separateWinter: false }, ROUNDED_FILTER, HYBRID, { beta: 0, gamma: 0 }),
  ...Object.fromEntries([1, 2, 4].map((drift) => [`rounded-driver-drift-${drift}`, (env) => hybrid(env,
    { wet: false, fit: false, shrink: false, separateWinter: false },
    { race: { ...ROUNDED_FILTER.race, raceD: drift }, qual: { ...ROUNDED_FILTER.qual, raceD: drift } })])),
});

// Fixed learning-temperature family; the historical candidates keep their defaults.
export function temperedHybridCandidate(env, temperature, allowMoveVariance = true) {
  return hybrid(env, { wet: false, fit: false, shrink: false, separateWinter: false,
    learningRate: HYBRID.ranking.learningRate * temperature },
  { race: { ...ROUNDED_FILTER.race, tau: ROUNDED_FILTER.race.tau * temperature, sdJ: allowMoveVariance ? ROUNDED_FILTER.race.sdJ : 0 },
    qual: { ...ROUNDED_FILTER.qual, tau: ROUNDED_FILTER.qual.tau * temperature, sdJ: allowMoveVariance ? ROUNDED_FILTER.qual.sdJ : 0 } },
  HYBRID, { beta: 0.4, gamma: 0 });
}
