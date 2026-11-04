// Nested ablations of the production rating system. These retain the shipped
// filter settings so that each comparison removes a named source of complexity.
import { stateSpaceRun } from '../../packages/eval/src/adapters.js';
import { qualLink } from '../../packages/core/src/state-space/qualifying-link.js';
import { ORIGINAL_FILTER } from './candidates-ranking.mjs';
import { jointDuelFactorModel } from './joint-duel-factor-model.mjs';
import { jointGaussian } from './candidates-joint.mjs';

function filters(env, linked, fit) {
  const { timeline, prep } = env;
  const qual = stateSpaceRun(timeline, 'qual', prep.ctx, ORIGINAL_FILTER.qual);
  const context = linked ? { ...prep.ctx, ...qualLink(qual.raw, 0.4, 0.3) } : prep.ctx;
  const race = stateSpaceRun(timeline, 'race', context, { ...ORIGINAL_FILTER.race, ...(fit ? {} : { sdA: 0 }) });
  return { race, qual };
}

export const candidates = {
  linked: (env) => filters(env, true, true),
  independent: (env) => filters(env, false, true),
  'linked-without-fit': (env) => filters(env, true, false),
  'joint-gaussian': jointGaussian,
  'joint-gaussian-driver20-residual9': (env) => jointGaussian(env, { driverSd: 20, raceResidualSd: 9 }),
  'joint-gaussian-driver20-residual18': (env) => jointGaussian(env, { driverSd: 20, raceResidualSd: 18 }),
  'joint-gaussian-driver30-residual9': (env) => jointGaussian(env, { driverSd: 30, raceResidualSd: 9 }),
  'joint-gaussian-driver30-residual18': (env) => jointGaussian(env, { driverSd: 30, raceResidualSd: 18 }),
  'joint-factor': jointFactor,
  'joint-with-fit': jointWithFit,
};

function jointFactor(env) {
  const timeline = env.timeline.map((weekend) => ({ ...weekend, rows: expandedRows(weekend) }));
  const runs = jointDuelFactorModel(timeline, env.prep.ctx.carOf);
  for (const session of ['race', 'qual']) for (const [index, weekend] of env.timeline.entries()) {
    const rows = expandedRows(weekend, session);
    const drivers = new Set(rows.map((row) => String(row.driverId)));
    const cars = new Set(rows.map((row) => String(row.constructorId)));
    for (const key of ['rated', 'drivers', 'cars']) {
      const allowed = key === 'cars' ? cars : drivers;
      runs[session].pre[index][key] = new Map([...runs[session].pre[index][key]].filter(([id]) => allowed.has(id)));
    }
  }
  return runs;
}

function expandedRows(weekend, session = null) {
  const rows = weekend.rows.slice();
  for (const name of session ? [session] : ['race', 'qual']) for (const observation of weekend.obs[name]) {
    rows.push({ driverId: observation.x, constructorId: observation.cx }, { driverId: observation.y, constructorId: observation.cy });
  }
  return rows;
}

// One shared portable driver, separate session cars, and one driver-team fit.
// Updates use per-entity weighted mean residuals, so a weekend of dependent
// pair observations cannot acquire unlimited weight by adding more pairs.
const logOddsPerPoint = Math.LN10 / 75;
const probability = (value) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));

function jointWithFit({ timeline, prep }) {
  const values = new Map();
  const runs = Object.fromEntries(['race', 'qual'].map((session) => [session, {
    name: `joint-with-fit-${session}`, session, k: logOddsPerPoint, pre: [], post: [], z: [], drift: null,
  }]));
  const get = (key) => values.get(key) ?? 0;
  const driver = (id) => `driver:${id}`;
  const car = (session, id) => `car:${session}:${prep.ctx.carOf(id)}`;
  const fit = (id, constructor) => `fit:${id}:${prep.ctx.carOf(constructor)}`;
  let previousYear = null;
  for (const weekend of timeline) {
    if (previousYear !== null && previousYear !== weekend.year) {
      for (const [key, value] of values) values.set(key, value * (key.startsWith('driver:') ? 0.95 : key.startsWith('car:') ? 0.65 : 0.4));
    }
    previousYear = weekend.year;
    const gradient = new Map();
    const exposure = new Map();
    const accumulate = (key, coefficient, residual, weight) => {
      gradient.set(key, (gradient.get(key) ?? 0) + weight * coefficient * residual);
      exposure.set(key, (exposure.get(key) ?? 0) + weight * coefficient * coefficient);
    };
    for (const session of ['race', 'qual']) {
      const run = runs[session];
      const drivers = new Map(expandedRows(weekend, session).map((row) => [String(row.driverId), get(driver(String(row.driverId)))]));
      const cars = new Map(expandedRows(weekend, session).map((row) => [String(row.constructorId), get(car(session, String(row.constructorId)))]));
      run.pre.push({ rated: drivers, drivers, cars });
      const scores = [];
      for (const observation of weekend.obs[session]) {
        const terms = [
          [driver(observation.x), 1], [driver(observation.y), -1],
          [fit(observation.x, observation.cx), 1], [fit(observation.y, observation.cy), -1],
          ...(observation.same ? [] : [[car(session, observation.cx), 1], [car(session, observation.cy), -1]]),
        ];
        const score = logOddsPerPoint * terms.reduce((sum, [key, coefficient]) => sum + coefficient * get(key), 0);
        scores.push(score);
        const weight = observation.w * (observation.same ? 3 : 1);
        for (const [key, coefficient] of terms) accumulate(key, coefficient, observation.o - probability(score), weight);
      }
      const plain = Float64Array.from(scores);
      run.z.push({ plain, adj: plain, vari: null });
    }
    for (const [key, amount] of gradient) {
      const isFit = key.startsWith('fit:');
      const step = isFit ? 25 : key.startsWith('driver:') ? 80 : 100;
      const retention = isFit ? 0.85 : 1;
      values.set(key, Math.max(-200, Math.min(200, retention * get(key) + step * amount / exposure.get(key))));
    }
    for (const session of ['race', 'qual']) {
      runs[session].post.push({
        drivers: new Map(weekend.rows.map((row) => [String(row.driverId), { m: get(driver(String(row.driverId))), sd: null, seen: true }])),
        cars: new Map(weekend.rows.map((row) => [String(row.constructorId), { m: get(car(session, String(row.constructorId))), sd: null, seen: true }])),
      });
    }
  }
  return runs;
}

export { jointWithFit };
