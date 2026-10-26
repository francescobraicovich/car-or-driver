// Online comparison learner. Its portable driver levels supply the third
// source of the published hybrid; its car and fit levels help learn them but
// are not added to the published car rating.
import { HYBRID } from '../presets/hybrid.js';

const LOG_ODDS_PER_POINT = Math.LN10 / 75;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const sigmoid = (value) => 1 / (1 + Math.exp(-clamp(value, -30, 30)));

export function rankingRatings(weekends, carOf, wetByWeekend) {
  const settings = HYBRID.ranking;
  const values = new Map();
  const pre = [];
  const post = [];
  const get = (key) => values.get(key) ?? 0;
  let previousYear = null;
  for (const [index, weekend] of weekends.entries()) {
    if (previousYear !== null && weekend.year !== previousYear) {
      for (const [key, value] of values) {
        const retention = key.startsWith('car:')
          ? settings.carWinterRetention
          : key.startsWith('fit:')
            ? 0.4
            : settings.driverWinterRetention;
        values.set(key, value * retention);
      }
    }
    previousYear = weekend.year;
    const drivers = new Map();
    const cars = new Map();
    const include = (driverId, constructorId) => {
      drivers.set(driverId, get(`driver:${driverId}`));
      cars.set(constructorId, get(`car:${carOf(constructorId)}`));
    };
    for (const row of weekend.rows) include(String(row.driverId), String(row.constructorId));
    for (const observation of [...weekend.raceObs, ...weekend.qualObs]) {
      include(observation.x, observation.cx);
      include(observation.y, observation.cy);
    }
    pre.push({ drivers, rated: drivers, cars });

    const features = (observation) =>
      [
        [`driver:${observation.x}`, 1],
        [`driver:${observation.y}`, -1],
        [`car:${carOf(observation.cx)}`, 1],
        [`car:${carOf(observation.cy)}`, -1],
        [`fit:${observation.x}:${carOf(observation.cx)}`, 1],
        [`fit:${observation.y}:${carOf(observation.cy)}`, -1],
        ...(wetByWeekend[index]
          ? [
              [`wet-driver:${observation.x}`, 1],
              [`wet-driver:${observation.y}`, -1],
            ]
          : []),
      ].filter(([, coefficient]) => coefficient);
    const probability = (observation) =>
      sigmoid(LOG_ODDS_PER_POINT * features(observation).reduce((sum, [key, coefficient]) => sum + coefficient * get(key), 0));
    const weight = weekend.raceObs.reduce((sum, observation) => sum + observation.w * (observation.same ? settings.teammateWeight : 1), 0);
    const gradient = new Map();
    for (const observation of weekend.raceObs) {
      const error =
        (observation.w * (observation.same ? settings.teammateWeight : 1) * (observation.o - probability(observation))) / weight;
      for (const [key, coefficient] of features(observation)) gradient.set(key, (gradient.get(key) ?? 0) + error * coefficient);
    }
    for (const [key, amount] of gradient) {
      const penalty = key.startsWith('fit:') ? settings.fitPenalty : settings.levelPenalty;
      values.set(key, clamp((1 - penalty) * get(key) + settings.learningRate * amount, -200, 200));
    }
    post.push({
      drivers: new Map(weekend.rows.map((row) => [String(row.driverId), { m: get(`driver:${row.driverId}`) }])),
      cars: new Map(weekend.rows.map((row) => [String(row.constructorId), { m: get(`car:${carOf(String(row.constructorId))}`) }])),
    });
  }
  return { pre, post, levels: values };
}
