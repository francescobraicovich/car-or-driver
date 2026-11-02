// Independent research models. None of these functions is imported by the site.

const POINTS_PER_LOG_ODDS = 75 / Math.LN10;
const LOG_ODDS_PER_POINT = 1 / POINTS_PER_LOG_ODDS;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const sigmoid = (value) => 1 / (1 + Math.exp(-clamp(value, -30, 30)));

const ratingMap = (entries) => new Map(entries.map(([id, value]) => [id, { m: value, sd: null, seen: true }]));
const modelSnapshot = (weekend, driver, car, carOf) => {
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
  return { drivers, rated: drivers, cars };
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

export function discriminativeRanking(timeline, session, carOf, options = {}) {
  const learningRate = options.learningRate ?? 120;
  const fitPenalty = options.fitPenalty ?? 0.15;
  const levelPenalty = options.levelPenalty ?? 0.01;
  const carWinterRetention = options.carWinterRetention ?? 0.55;
  const driverWinterRetention = options.driverWinterRetention ?? 0.95;
  const teammateWeight = options.teammateWeight ?? 1;
  const values = new Map();
  const pre = [];
  const post = [];
  const z = [];
  const get = (key) => values.get(key) ?? 0;
  let previousYear = null;
  for (const weekend of timeline) {
    if (previousYear !== null && weekend.year !== previousYear) {
      for (const [key, value] of values)
        values.set(key, value * (key.startsWith('car:') ? carWinterRetention : key.startsWith('fit:') ? 0.4 : driverWinterRetention));
    }
    previousYear = weekend.year;
    const snapshot = modelSnapshot(
      weekend,
      (id) => get(`driver:${id}`),
      (id) => get(`car:${id}`),
      carOf,
    );
    const features = (ob) =>
      [
        [`driver:${ob.x}`, 1],
        [`driver:${ob.y}`, -1],
        [`car:${carOf(ob.cx)}`, 1],
        [`car:${carOf(ob.cy)}`, -1],
        [`fit:${ob.x}:${carOf(ob.cx)}`, 1],
        [`fit:${ob.y}:${carOf(ob.cy)}`, -1],
        ...(weekend.wet
          ? [
              [`wet-driver:${ob.x}`, 1],
              [`wet-driver:${ob.y}`, -1],
            ]
          : []),
      ].filter(([, coefficient]) => coefficient);
    const predict = (ob) => LOG_ODDS_PER_POINT * features(ob).reduce((sum, [key, coefficient]) => sum + coefficient * get(key), 0);
    pre.push(snapshot);
    z.push(Float64Array.from(weekend.obs[session], predict));
    const gradient = new Map();
    const weight = weekend.obs[session].reduce((sum, ob) => sum + ob.w * (ob.same ? teammateWeight : 1), 0);
    for (const ob of weekend.obs[session]) {
      const error = (ob.w * (ob.same ? teammateWeight : 1) * (ob.o - sigmoid(predict(ob)))) / weight;
      for (const [key, coefficient] of features(ob)) gradient.set(key, (gradient.get(key) ?? 0) + error * coefficient);
    }
    for (const [key, amount] of gradient) {
      const penalty = key.startsWith('fit:') ? fitPenalty : levelPenalty;
      values.set(key, clamp((1 - penalty) * get(key) + learningRate * amount, -200, 200));
    }
    post.push({
      drivers: ratingMap(weekend.rows.map((row) => [String(row.driverId), get(`driver:${row.driverId}`)])),
      cars: ratingMap(weekend.rows.map((row) => [String(row.constructorId), get(`car:${carOf(String(row.constructorId))}`)])),
    });
  }
  return completeRun('discriminative-ranking', session, pre, post, z);
}
