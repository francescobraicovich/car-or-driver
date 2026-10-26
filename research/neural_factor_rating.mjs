// Research-only neural factorisation of pair results. Portable driver and car
// levels are explicit scalar outputs. A bounded two-sided latent interaction
// learns general driver-style/car-style compatibility from prior weekends.
// Every driver and car follows the same update rule, including after a move.
const POINTS_PER_LOG_ODDS = 75 / Math.LN10;
const LOG_ODDS_PER_POINT = 1 / POINTS_PER_LOG_ODDS;
const sigmoid = (value) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));
const clamp = (value, bound) => Math.max(-bound, Math.min(bound, value));
const seedValue = (key, component) => {
  let hash = 2166136261;
  for (const symbol of `${key}:${component}`) hash = Math.imul(hash ^ symbol.charCodeAt(0), 16777619);
  return ((hash >>> 0) / 4294967296 - 0.5) * 2;
};
const ratingMap = (entries) => new Map(entries.map(([id, value]) => [id, { m: value }]));

export function neuralFactorRating(timeline, session, carOf, options = {}) {
  const dimension = options.dimension ?? 2;
  const learningRate = options.learningRate ?? 180;
  const factorLearningRate = options.factorLearningRate ?? 40;
  const teammateWeight = options.teammateWeight ?? 2;
  const factorBound = options.factorBound ?? 25;
  const factorPenalty = options.factorPenalty ?? 0.02;
  const levelPenalty = options.levelPenalty ?? 0.001;
  const carWinterRetention = options.carWinterRetention ?? 0.8;
  const driverWinterRetention = options.driverWinterRetention ?? 0.95;
  const interactionLimit = options.interactionLimit ?? 20;
  const seedScale = options.seedScale ?? 1;
  const values = new Map();
  const factors = new Map();
  const pre = [];
  const post = [];
  const z = [];
  let priorYear = null;
  const car = (id) => carOf(id);
  const get = (key) => values.get(key) ?? 0;
  const vector = (key) => {
    if (!factors.has(key)) factors.set(key,
      Float64Array.from({ length: dimension }, (_, j) => seedScale * seedValue(key, j)));
    return factors.get(key);
  };
  const fit = (driverId, carId) => {
    const first = vector(`driver:${driverId}`);
    const second = vector(`car:${carId}`);
    let product = 0;
    for (let j = 0; j < dimension; j++) product += first[j] * second[j];
    return interactionLimit * Math.tanh(product / interactionLimit);
  };
  for (const weekend of timeline) {
    if (priorYear !== null && weekend.year !== priorYear) {
      for (const [key, value] of values) values.set(key,
        value * (key.startsWith('driver:') ? driverWinterRetention : carWinterRetention));
      for (const [key, factor] of factors) {
        const retention = key.startsWith('driver:') ? driverWinterRetention : carWinterRetention;
        for (let j = 0; j < dimension; j++) factor[j] *= retention;
      }
    }
    priorYear = weekend.year;
    const rated = new Map(weekend.rows.map((row) => [String(row.driverId), get(`driver:${row.driverId}`)]));
    const cars = new Map(weekend.rows.map((row) => [String(row.constructorId), get(`car:${car(String(row.constructorId))}`)]));
    pre.push({ rated, drivers: rated, cars });
    const score = (ob) => {
      const firstCar = car(ob.cx);
      const secondCar = car(ob.cy);
      return get(`driver:${ob.x}`) - get(`driver:${ob.y}`) +
        get(`car:${firstCar}`) - get(`car:${secondCar}`) +
        fit(ob.x, firstCar) - fit(ob.y, secondCar);
    };
    const plain = Float64Array.from(weekend.obs[session], (ob) => LOG_ODDS_PER_POINT * score(ob));
    z.push({ plain, adj: plain, vari: null });
    const gradients = new Map();
    const factorGradients = new Map();
    const totalWeight = weekend.obs[session].reduce((sum, ob) =>
      sum + ob.w * (ob.same ? teammateWeight : 1), 0);
    const add = (map, key, amount) => map.set(key, (map.get(key) ?? 0) + amount);
    const addFactor = (key, index, amount) => {
      if (!factorGradients.has(key)) factorGradients.set(key, new Float64Array(dimension));
      factorGradients.get(key)[index] += amount;
    };
    for (const ob of weekend.obs[session]) {
      const firstCar = car(ob.cx);
      const secondCar = car(ob.cy);
      const residual = ob.w * (ob.same ? teammateWeight : 1) *
        (ob.o - sigmoid(LOG_ODDS_PER_POINT * score(ob))) / totalWeight;
      add(gradients, `driver:${ob.x}`, residual);
      add(gradients, `driver:${ob.y}`, -residual);
      if (firstCar !== secondCar) {
        add(gradients, `car:${firstCar}`, residual);
        add(gradients, `car:${secondCar}`, -residual);
      }
      for (const [driverId, carId, sign] of [[ob.x, firstCar, 1], [ob.y, secondCar, -1]]) {
        const driverKey = `driver:${driverId}`;
        const carKey = `car:${carId}`;
        const d = vector(driverKey);
        const c = vector(carKey);
        const activation = fit(driverId, carId) / interactionLimit;
        const derivative = 1 - activation * activation;
        for (let j = 0; j < dimension; j++) {
          addFactor(driverKey, j, sign * residual * derivative * c[j]);
          addFactor(carKey, j, sign * residual * derivative * d[j]);
        }
      }
    }
    for (const [key, gradient] of gradients) values.set(key,
      clamp((1 - levelPenalty) * get(key) + learningRate * gradient, 200));
    for (const [key, gradient] of factorGradients) {
      const factor = vector(key);
      for (let j = 0; j < dimension; j++) factor[j] = clamp(
        (1 - factorPenalty) * factor[j] + factorLearningRate * gradient[j], factorBound);
    }
    post.push({
      drivers: ratingMap(weekend.rows.map((row) => [String(row.driverId), get(`driver:${row.driverId}`)])),
      cars: ratingMap(weekend.rows.map((row) => [String(row.constructorId), get(`car:${car(String(row.constructorId))}`)])),
    });
  }
  return { name: 'neural-driver-car-factor', session, k: LOG_ODDS_PER_POINT, pre, post, z };
}
