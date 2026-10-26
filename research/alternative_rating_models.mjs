// Independent research models. None of these functions is imported by the site.
import { readFileSync } from 'node:fs';
import { csv } from '../packages/core/src/csv.js';
import { compareWindows } from '../packages/core/src/lap-pace.js';

const POINTS_PER_LOG_ODDS = 75 / Math.LN10;
const LOG_ODDS_PER_POINT = 1 / POINTS_PER_LOG_ODDS;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const sigmoid = (value) => 1 / (1 + Math.exp(-clamp(value, -30, 30)));
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const median = (values) => {
  const ordered = values.slice().sort((a, b) => a - b);
  return ordered.length ? ordered[Math.floor(ordered.length / 2)] : NaN;
};

/** Dated, driver-specific component evidence; an event is invisible on its publication date. */
export function componentExposure(timeline, races) {
  const reports = csv(readFileSync(new URL('./power-unit-events.csv', import.meta.url), 'utf8'));
  const dates = new Map(races.map((race) => [String(race.raceId), race]));
  const output = { race: new Map(), qual: new Map() };
  for (const report of reports) {
    if (!['ICE', 'TC', 'MGU-H', 'MGU-K'].includes(report.component)) continue;
    const race = dates.get(report.raceId);
    if (!race) continue;
    for (const session of ['race', 'qual']) {
      const date = session === 'race' ? race.date : race.quali_date;
      if (!date || !report.published || report.published.slice(0, 10) >= date) continue;
      if (!output[session].has(report.raceId)) output[session].set(report.raceId, new Set());
      output[session].get(report.raceId).add(report.driverId);
    }
  }
  return timeline.map((weekend) => ({
    race: output.race.get(weekend.raceId) ?? new Set(),
    qual: output.qual.get(weekend.raceId) ?? new Set(),
  }));
}

const ratingMap = (entries) => new Map(entries.map(([id, value]) => [id, { m: value, sd: null, seen: true }]));
const modelSnapshot = (weekend, driver, car, carOf, part, componentEffect) => {
  const drivers = new Map();
  const cars = new Map();
  for (const row of weekend.rows) {
    drivers.set(String(row.driverId), driver(String(row.driverId)));
    cars.set(String(row.constructorId), car(carOf(String(row.constructorId))));
  }
  for (const ob of [...weekend.obs.race, ...weekend.obs.qual]) {
    if (!drivers.has(ob.x)) drivers.set(ob.x, driver(ob.x));
    if (!drivers.has(ob.y)) drivers.set(ob.y, driver(ob.y));
    if (!cars.has(ob.cx)) cars.set(ob.cx, car(carOf(ob.cx)));
    if (!cars.has(ob.cy)) cars.set(ob.cy, car(carOf(ob.cy)));
  }
  const effectiveCars = new Map(cars);
  // Component changes belong to a particular driver's car, not to a whole team.
  const z = (ob) => LOG_ODDS_PER_POINT * (
    drivers.get(ob.x) - drivers.get(ob.y) +
    effectiveCars.get(ob.cx) - effectiveCars.get(ob.cy) +
    componentEffect * (Number(part.has(ob.x)) - Number(part.has(ob.y)))
  );
  return { pre: { drivers, rated: drivers, cars }, z };
};
const completeRun = (name, session, pre, post, z) => ({
  name,
  session,
  k: LOG_ODDS_PER_POINT,
  pre,
  post,
  z: z.map((plain) => ({ plain, adj: plain, vari: null })),
  drift: null,
});

/** Conjugate-gradient solution of a ridge-regularised comparison graph. */
export function solveRows(rows, ridge, priors = []) {
  const keys = new Set();
  for (const row of rows) for (const [key] of row.features) keys.add(key);
  for (const [key] of priors) keys.add(key);
  const names = [...keys];
  const index = new Map(names.map((name, position) => [name, position]));
  const coded = rows.map((row) => ({
    features: row.features.map(([key, coefficient]) => [index.get(key), coefficient]),
    target: row.target,
    weight: row.weight,
  }));
  const diagonal = Float64Array.from(names, (key) => ridge(key));
  const right = new Float64Array(names.length);
  for (const row of coded) {
    for (const [j, coefficient] of row.features) {
      diagonal[j] += row.weight * coefficient * coefficient;
      right[j] += row.weight * coefficient * row.target;
    }
  }
  for (const [key, value, weight] of priors) {
    const j = index.get(key);
    diagonal[j] += weight;
    right[j] += weight * value;
  }
  const multiply = (vector) => {
    const output = Float64Array.from(vector, (value, j) => ridge(names[j]) * value);
    for (const row of coded) {
      let projection = 0;
      for (const [j, coefficient] of row.features) projection += coefficient * vector[j];
      for (const [j, coefficient] of row.features) output[j] += row.weight * coefficient * projection;
    }
    for (const [key, , weight] of priors) output[index.get(key)] += weight * vector[index.get(key)];
    return output;
  };
  const value = new Float64Array(names.length);
  let residual = right.slice();
  let direction = Float64Array.from(residual, (v, j) => v / diagonal[j]);
  let norm = residual.reduce((sum, v, j) => sum + v * direction[j], 0);
  const original = norm;
  for (let iteration = 0; iteration < 80 && norm > original * 1e-12; iteration++) {
    const product = multiply(direction);
    let denominator = 0;
    for (let j = 0; j < names.length; j++) denominator += direction[j] * product[j];
    if (!(denominator > 0)) break;
    const step = norm / denominator;
    for (let j = 0; j < names.length; j++) {
      value[j] += step * direction[j];
      residual[j] -= step * product[j];
    }
    const next = Float64Array.from(residual, (v, j) => v / diagonal[j]);
    let nextNorm = 0;
    for (let j = 0; j < names.length; j++) nextNorm += residual[j] * next[j];
    const ratio = nextNorm / norm;
    for (let j = 0; j < names.length; j++) direction[j] = next[j] + ratio * direction[j];
    norm = nextNorm;
  }
  return new Map(names.map((name, j) => [name, value[j]]));
}

function observedProbability(rows) {
  let weight = 0;
  let wins = 0;
  for (const row of rows) {
    weight += row.w;
    wins += row.w * row.o;
  }
  return wins / weight;
}

function solveLogisticGraph(edges, year, memory, ridge, offset, initial) {
  let levels = initial;
  const current = edges.filter((edge) => year - edge.year <= 8);
  for (let step = 0; step < 5; step++) {
    const rows = current.map((edge) => {
      const difference = (levels.get(edge.a) ?? 0) - (levels.get(edge.b) ?? 0);
      const baseline = offset(edge);
      const probability = sigmoid(LOG_ODDS_PER_POINT * (difference + baseline));
      const variance = Math.max(0.02, probability * (1 - probability));
      return {
        features: [[edge.a, 1], [edge.b, -1]],
        target: clamp(difference + (edge.probability - probability) * POINTS_PER_LOG_ODDS / variance, -250, 250),
        weight: edge.weight * memory ** (year - edge.year) * LOG_ODDS_PER_POINT ** 2 * variance,
      };
    });
    levels = solveRows(rows, () => ridge);
  }
  return levels;
}

/** A career comparison network for drivers and a separate constructor network. */
export function teammateNetwork(timeline, session, carOf, exposure, options = {}) {
  const driverMemory = options.driverMemory ?? 0.82;
  const carMemory = options.carMemory ?? 0.62;
  const driverRidge = options.driverRidge ?? 0.8;
  const carRidge = options.carRidge ?? 1.5;
  const graph = [];
  const carGraph = [];
  const pre = [];
  const post = [];
  const z = [];
  let driver = new Map();
  let car = new Map();
  let previousYear = null;
  let componentEffect = 0;
  let componentResidual = 0;
  let componentWeight = 20;
  const fitDriver = (year) => solveLogisticGraph(graph, year, driverMemory, driverRidge * 0.001, () => 0, driver);
  const driverDifference = (pairs) => {
    let sum = 0;
    let weight = 0;
    for (const pair of pairs) {
      sum += pair.w * ((driver.get(pair.x) ?? 0) - (driver.get(pair.y) ?? 0));
      weight += pair.w;
    }
    return sum / weight;
  };
  const fitCar = (year) => solveLogisticGraph(carGraph, year, carMemory, carRidge * 0.001, (edge) => driverDifference(edge.driverPairs) + componentEffect * edge.partGap, car);
  for (const [i, weekend] of timeline.entries()) {
    if (weekend.year !== previousYear) {
      driver = fitDriver(weekend.year);
      car = fitCar(weekend.year);
    }
    previousYear = weekend.year;
    const part = exposure[i][session];
    const snapshot = modelSnapshot(weekend, (id) => driver.get(id) ?? 0, (id) => car.get(id) ?? 0, carOf, part, componentEffect);
    pre.push(snapshot.pre);
    z.push(Float64Array.from(weekend.obs[session], snapshot.z));
    const mates = new Map();
    const carPairs = new Map();
    for (const ob of weekend.obs[session]) {
      const a = ob.same ? ob.x : carOf(ob.cx);
      const b = ob.same ? ob.y : carOf(ob.cy);
      if (a === b) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const forward = a < b;
      const map = ob.same ? mates : carPairs;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ w: ob.w, o: forward ? ob.o : 1 - ob.o, x: forward ? ob.x : ob.y, y: forward ? ob.y : ob.x, cx: forward ? ob.cx : ob.cy, cy: forward ? ob.cy : ob.cx });
    }
    for (const [key, observations] of mates) {
      const [a, b] = key.split('|');
      graph.push({ a, b, probability: observedProbability(observations), weight: 1, year: weekend.year });
    }
    for (const [key, observations] of carPairs) {
      const [a, b] = key.split('|');
      const observed = POINTS_PER_LOG_ODDS * Math.log(clamp(observedProbability(observations), 0.1, 0.9) / (1 - clamp(observedProbability(observations), 0.1, 0.9)));
      const driverGap = driverDifference(observations);
      const partGap = average(observations.map((ob) => Number(part.has(ob.x)) - Number(part.has(ob.y))));
      carGraph.push({
        a, b, probability: observedProbability(observations),
        driverPairs: observations.map((ob) => ({ x: ob.x, y: ob.y, w: ob.w })),
        partGap, weight: 1, year: weekend.year,
      });
      if (partGap) {
        componentResidual += partGap * (observed - driverGap - (car.get(a) ?? 0) + (car.get(b) ?? 0));
        componentWeight += partGap * partGap;
      }
    }
    componentEffect = clamp(componentResidual / componentWeight, -25, 25);
    driver = fitDriver(weekend.year);
    car = fitCar(weekend.year);
    post.push({
      drivers: ratingMap(weekend.rows.map((row) => [String(row.driverId), driver.get(String(row.driverId)) ?? 0])),
      cars: ratingMap(weekend.rows.map((row) => [String(row.constructorId), car.get(carOf(String(row.constructorId))) ?? 0])),
    });
  }
  return { ...completeRun('teammate-network', session, pre, post, z), componentEffect };
}

const seconds = (value) => {
  if (!value || value === '\\N') return NaN;
  const sections = value.split(':');
  return sections.length === 2 ? 60 * +sections[0] + +sections[1] : +value;
};

/** Comparable continuous pace measurements, independent of finishing order. */
function paceRows(weekend, session, data, carOf, part) {
  const byRace = session === 'race'
    ? data.lapPace.get(weekend.raceId)
    : new Map(data.raw.qualifying.filter((row) => String(row.raceId) === weekend.raceId).map((row) => [String(row.driverId), { med: seconds(row.q1), n: 1 }]));
  if (!byRace) return [];
  const entrants = weekend.rows.map((row) => ({
    driverId: String(row.driverId),
    carId: carOf(String(row.constructorId)),
    pace: byRace.get(String(row.driverId))?.med,
    laps: byRace.get(String(row.driverId))?.n ?? 0,
    windows: byRace.get(String(row.driverId))?.win,
  })).filter((row) => Number.isFinite(row.pace) && (session === 'qual' || row.laps >= 10));
  if (entrants.length < 8) return [];
  const middle = median(entrants.map((row) => row.pace));
  const valid = entrants.filter((row) => Math.abs(row.pace - middle) < (session === 'race' ? 5 : 4));
  const rows = [];
  for (let a = 0; a < valid.length; a++) {
    const first = valid[a];
    const opponents = valid.filter((row) => row !== first && row.carId !== first.carId);
    const mate = valid.find((row) => row !== first && row.carId === first.carId);
    const selected = [mate, opponents[(a * 3) % opponents.length], opponents[(a * 3 + 7) % opponents.length]].filter(Boolean);
    for (const second of selected) {
      if (first.driverId > second.driverId) continue;
      const matched = session === 'race' ? compareWindows(first.windows, second.windows) : null;
      if (session === 'race' && !matched) continue;
      const gapSeconds = matched ? matched.gapSec * matched.faster : second.pace - first.pace;
      rows.push({
        features: [
          [`driver:${first.driverId}`, 1], [`driver:${second.driverId}`, -1],
          [`car:${weekend.year}:${first.carId}`, 1], [`car:${weekend.year}:${second.carId}`, -1],
          ['component', Number(part.has(first.driverId)) - Number(part.has(second.driverId))],
        ].filter(([, coefficient]) => coefficient),
        target: clamp(35 * gapSeconds, -150, 150),
        weight: 1,
        year: weekend.year,
      });
    }
  }
  return rows;
}

/** Batch ridge regression on same-race lap or qualifying times, with season-specific cars. */
export function continuousPace(timeline, session, data, carOf, exposure, options = {}) {
  const memory = options.memory ?? 0.78;
  const driverRidge = options.driverRidge ?? 1.5;
  const carRidge = options.carRidge ?? 1;
  const evidence = [];
  const continuity = [];
  const knownCars = new Set();
  const pre = [];
  const post = [];
  const z = [];
  const solve = (year) => {
    const rows = [...evidence, ...continuity].filter((row) => year - row.year <= 7).map((row) => ({ ...row, weight: row.weight * memory ** (year - row.year) }));
    return solveRows(rows, (key) => key === 'component' ? 20 : key.startsWith('driver:') ? driverRidge : carRidge);
  };
  let level = new Map();
  let previousYear = null;
  for (const [i, weekend] of timeline.entries()) {
    for (const entry of weekend.rows) {
      const car = carOf(String(entry.constructorId));
      const current = `car:${weekend.year}:${car}`;
      const earlier = `car:${weekend.year - 1}:${car}`;
      if (!knownCars.has(current)) {
        knownCars.add(current);
        if (knownCars.has(earlier)) continuity.push({ features: [[current, 1], [earlier, -0.6]], target: 0, weight: 0.4, year: weekend.year });
      }
    }
    if (weekend.year !== previousYear) level = solve(weekend.year);
    previousYear = weekend.year;
    const part = exposure[i][session];
    const carValue = (id) => level.get(`car:${weekend.year}:${id}`) ?? 0.6 * (level.get(`car:${weekend.year - 1}:${id}`) ?? 0);
    const snapshot = modelSnapshot(weekend, (id) => level.get(`driver:${id}`) ?? 0, carValue, carOf, part, level.get('component') ?? 0);
    pre.push(snapshot.pre);
    z.push(Float64Array.from(weekend.obs[session], snapshot.z));
    evidence.push(...paceRows(weekend, session, data, carOf, part));
    level = solve(weekend.year);
    post.push({
      drivers: ratingMap(weekend.rows.map((row) => [String(row.driverId), level.get(`driver:${row.driverId}`) ?? 0])),
      cars: ratingMap(weekend.rows.map((row) => [String(row.constructorId), level.get(`car:${weekend.year}:${carOf(String(row.constructorId))}`) ?? 0])),
    });
  }
  return { ...completeRun('continuous-pace', session, pre, post, z), componentEffect: level.get('component') ?? 0 };
}

/** Direct regularised ranking learner with explicit driver, car and fit coefficients. */
export function discriminativeRanking(timeline, session, carOf, exposure, options = {}) {
  const learningRate = options.learningRate ?? 120;
  const fitPenalty = options.fitPenalty ?? 0.15;
  const levelPenalty = options.levelPenalty ?? 0.01;
  const carWinterRetention = options.carWinterRetention ?? 0.55;
  const driverWinterRetention = options.driverWinterRetention ?? 0.95;
  const teammateWeight = options.teammateWeight ?? 1;
  const includeComponent = options.includeComponent ?? true;
  const values = new Map();
  const pre = [];
  const post = [];
  const z = [];
  const get = (key) => values.get(key) ?? 0;
  let previousYear = null;
  for (const [i, weekend] of timeline.entries()) {
    if (previousYear !== null && weekend.year !== previousYear) {
      for (const [key, value] of values) values.set(key, value * (key.startsWith('car:') ? carWinterRetention : key.startsWith('fit:') ? 0.4 : driverWinterRetention));
    }
    previousYear = weekend.year;
    const part = exposure[i][session];
    const snapshot = modelSnapshot(weekend, (id) => get(`driver:${id}`), (id) => get(`car:${id}`), carOf, part, includeComponent ? get('component') : 0);
    const features = (ob) => [
      [`driver:${ob.x}`, 1], [`driver:${ob.y}`, -1],
      [`car:${carOf(ob.cx)}`, 1], [`car:${carOf(ob.cy)}`, -1],
      [`fit:${ob.x}:${carOf(ob.cx)}`, 1], [`fit:${ob.y}:${carOf(ob.cy)}`, -1],
      ...(includeComponent ? [['component', Number(part.has(ob.x)) - Number(part.has(ob.y))]] : []),
      ...(weekend.wet ? [[`wet-driver:${ob.x}`, 1], [`wet-driver:${ob.y}`, -1]] : []),
    ].filter(([, coefficient]) => coefficient);
    const predict = (ob) => LOG_ODDS_PER_POINT * features(ob).reduce((sum, [key, coefficient]) => sum + coefficient * get(key), 0);
    pre.push(snapshot.pre);
    z.push(Float64Array.from(weekend.obs[session], predict));
    const gradient = new Map();
    const weight = weekend.obs[session].reduce((sum, ob) => sum + ob.w * (ob.same ? teammateWeight : 1), 0);
    for (const ob of weekend.obs[session]) {
      const error = ob.w * (ob.same ? teammateWeight : 1) * (ob.o - sigmoid(predict(ob))) / weight;
      for (const [key, coefficient] of features(ob)) gradient.set(key, (gradient.get(key) ?? 0) + error * coefficient);
    }
    for (const [key, amount] of gradient) {
      const penalty = key.startsWith('fit:') ? fitPenalty : key === 'component' ? 0.1 : levelPenalty;
      values.set(key, clamp((1 - penalty) * get(key) + learningRate * amount, -200, 200));
    }
    post.push({
      drivers: ratingMap(weekend.rows.map((row) => [String(row.driverId), get(`driver:${row.driverId}`)])),
      cars: ratingMap(weekend.rows.map((row) => [String(row.constructorId), get(`car:${carOf(String(row.constructorId))}`)])),
    });
  }
  return { ...completeRun('discriminative-ranking', session, pre, post, z), componentEffect: get('component') };
}
