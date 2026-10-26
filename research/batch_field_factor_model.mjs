// Research-only batch decomposition of field strength. Each completed weekend
// adds one field-score observation per entrant and teammate comparisons.
// The historical system is re-solved after each weekend; current evidence is
// never present in its pre-weekend forecast. No team-change feature is used.
import { solveRows } from './alternative_rating_models.mjs';

const LOG_ODDS_PER_POINT = Math.LN10 / 75;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const logit = (probability) => Math.log(probability / (1 - probability));
const ratingMap = (entries) => new Map(entries.map(([id, value]) => [id, { m: value }]));

export function batchFieldFactorModel(timeline, carOf, options = {}) {
  const evidence = [];
  const historyYears = options.historyYears ?? 5;
  const fade = options.fade ?? 0.8;
  const driverRidge = options.driverRidge ?? 1;
  const carRidge = options.carRidge ?? 0.5;
  const carContinuity = options.carContinuity ?? 0.7;
  const teammateWeight = options.teammateWeight ?? 2;
  const fieldWeight = options.fieldWeight ?? 1;
  const pointsPerLogit = options.pointsPerLogit ?? 24;
  const pre = [];
  const post = [];
  const z = [];
  let level = new Map();
  let priorYear = null;
  const knownCars = new Set();
  const carKey = (session, year, constructorId) => `car:${session}:${year}:${carOf(constructorId)}`;
  for (const weekend of timeline) {
    if (priorYear !== null && weekend.year !== priorYear) {
      for (const row of weekend.rows) {
        const carId = carOf(String(row.constructorId));
        for (const session of ['race', 'qual']) {
          const current = `car:${session}:${weekend.year}:${carId}`;
          const previous = `car:${session}:${weekend.year - 1}:${carId}`;
          if (knownCars.has(current)) continue;
          knownCars.add(current);
          if (knownCars.has(previous)) evidence.push({ year: weekend.year, weight: carContinuity,
            target: 0, features: [[current, 1], [previous, -0.7]] });
        }
      }
    } else {
      for (const row of weekend.rows) for (const session of ['race', 'qual'])
        knownCars.add(carKey(session, weekend.year, String(row.constructorId)));
    }
    priorYear = weekend.year;
    const driver = (id) => level.get(`driver:${id}`) ?? 0;
    const car = (session, id) => level.get(carKey(session, weekend.year, id)) ??
      0.7 * (level.get(carKey(session, weekend.year - 1, id)) ?? 0);
    const rated = new Map(weekend.rows.map((row) => [String(row.driverId), driver(String(row.driverId))]));
    const cars = new Map(weekend.rows.map((row) => [String(row.constructorId), car('race', String(row.constructorId))]));
    pre.push({ rated, drivers: rated, cars });
    const plain = Float64Array.from(weekend.obs.race, (ob) => LOG_ODDS_PER_POINT *
      (driver(ob.x) - driver(ob.y) + car('race', ob.cx) - car('race', ob.cy)));
    z.push({ plain, adj: plain, vari: null });
    for (const session of ['race', 'qual']) {
      const field = new Map();
      const mates = new Map();
      const collect = (map, id, outcome, weight) => {
        const row = map.get(id) ?? { wins: 0, weight: 0 };
        row.wins += weight * outcome;
        row.weight += weight;
        map.set(id, row);
      };
      for (const ob of weekend.obs[session]) {
        const map = ob.same ? mates : field;
        collect(map, ob.x, ob.o, ob.w);
        collect(map, ob.y, 1 - ob.o, ob.w);
      }
      for (const row of weekend.rows) {
        const id = String(row.driverId);
        const result = field.get(id);
        if (result && result.weight > 0) {
          const p = clamp((result.wins + 1) / (result.weight + 2), 0.08, 0.92);
          evidence.push({ year: weekend.year, weight: fieldWeight * Math.min(2, result.weight / 5),
            target: clamp(pointsPerLogit * logit(p), -65, 65),
            features: [[`driver:${id}`, 1], [carKey(session, weekend.year, String(row.constructorId)), 1]] });
        }
      }
      const seen = new Set();
      for (const row of weekend.rows) {
        const id = String(row.driverId);
        const other = weekend.rows.find((entry) => String(entry.driverId) !== id &&
          carOf(String(entry.constructorId)) === carOf(String(row.constructorId)));
        if (!other || seen.has(id)) continue;
        const mateId = String(other.driverId);
        seen.add(id);
        seen.add(mateId);
        const result = mates.get(id);
        if (result && result.weight > 0) {
          const p = clamp((result.wins + 1) / (result.weight + 2), 0.1, 0.9);
          evidence.push({ year: weekend.year, weight: teammateWeight,
            target: clamp(pointsPerLogit * logit(p), -55, 55),
            features: [[`driver:${id}`, 1], [`driver:${mateId}`, -1]] });
        }
      }
    }
    const rows = evidence.filter((row) => weekend.year - row.year <= historyYears)
      .map((row) => ({ ...row, weight: row.weight * fade ** (weekend.year - row.year) }));
    level = solveRows(rows, (key) => key.startsWith('driver:') ? driverRidge : carRidge);
    post.push({
      drivers: ratingMap(weekend.rows.map((row) => [String(row.driverId), driver(String(row.driverId))])),
      cars: ratingMap(weekend.rows.map((row) => [String(row.constructorId), car('race', String(row.constructorId))])),
    });
  }
  return { name: 'batch-field-factor', session: 'race', k: LOG_ODDS_PER_POINT, pre, post, z };
}
