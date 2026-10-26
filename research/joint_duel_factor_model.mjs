// Research-only joint race/qualifying factor learner. Every driver has one
// portable level; each constructor has separate race and qualifying levels.
// All entrants use the same update, including drivers who change constructor.
const POINTS_PER_LOG_ODDS = 75 / Math.LN10;
const LOG_ODDS_PER_POINT = 1 / POINTS_PER_LOG_ODDS;
const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));

export function jointDuelFactorModel(timeline, carOf, options = {}) {
  const driverStep = options.driverStep ?? 80;
  const carStep = options.carStep ?? 100;
  const teammateWeight = options.teammateWeight ?? 3;
  const qualifyingWeight = options.qualifyingWeight ?? 1;
  const raceWeight = options.raceWeight ?? 1;
  const driverWinter = options.driverWinter ?? 0.95;
  const carWinter = options.carWinter ?? 0.65;
  const driverDecay = options.driverDecay ?? 0;
  const carDecay = options.carDecay ?? 0;
  const values = new Map();
  const pre = [];
  const post = [];
  const z = [];
  const qualifyingPre = [];
  const qualifyingPost = [];
  const qualifyingZ = [];
  let priorYear = null;
  const get = (key) => values.get(key) ?? 0;
  const keyOf = (session, id) => `${session}:${carOf(id)}`;
  for (const weekend of timeline) {
    if (priorYear !== null && weekend.year !== priorYear) {
      for (const [key, value] of values)
        values.set(key, value * (key.startsWith('driver:') ? driverWinter : carWinter));
    }
    priorYear = weekend.year;
    const rated = new Map(weekend.rows.map((row) => [String(row.driverId), get(`driver:${row.driverId}`)]));
    const cars = new Map(weekend.rows.map((row) => [String(row.constructorId), get(keyOf('race', String(row.constructorId)))]));
    pre.push({ rated, drivers: rated, cars });
    const qualifyingCars = new Map(weekend.rows.map((row) => [String(row.constructorId), get(keyOf('qual', String(row.constructorId)))]));
    qualifyingPre.push({ rated, drivers: rated, cars: qualifyingCars });
    const raceZ = Float64Array.from(weekend.obs.race, (ob) => LOG_ODDS_PER_POINT *
      (get(`driver:${ob.x}`) - get(`driver:${ob.y}`) + get(keyOf('race', ob.cx)) - get(keyOf('race', ob.cy))));
    z.push({ plain: raceZ, adj: raceZ, vari: null });
    const qualZ = Float64Array.from(weekend.obs.qual, (ob) => LOG_ODDS_PER_POINT *
      (get(`driver:${ob.x}`) - get(`driver:${ob.y}`) + get(keyOf('qual', ob.cx)) - get(keyOf('qual', ob.cy))));
    qualifyingZ.push({ plain: qualZ, adj: qualZ, vari: null });
    const gradients = new Map();
    const exposures = new Map();
    const accumulate = (key, coefficient, residual, weight) => {
      gradients.set(key, (gradients.get(key) ?? 0) + weight * coefficient * residual);
      exposures.set(key, (exposures.get(key) ?? 0) + weight * coefficient * coefficient);
    };
    for (const [session, sessionWeight] of [['qual', qualifyingWeight], ['race', raceWeight]]) {
      for (const ob of weekend.obs[session]) {
        const first = `driver:${ob.x}`;
        const second = `driver:${ob.y}`;
        const carFirst = keyOf(session, ob.cx);
        const carSecond = keyOf(session, ob.cy);
        const carGap = carFirst === carSecond ? 0 : get(carFirst) - get(carSecond);
        const prediction = sigmoid(LOG_ODDS_PER_POINT * (get(first) - get(second) + carGap));
        const weight = ob.w * sessionWeight * (ob.same ? teammateWeight : 1);
        const residual = ob.o - prediction;
        accumulate(first, 1, residual, weight);
        accumulate(second, -1, residual, weight);
        if (!ob.same) {
          accumulate(carFirst, 1, residual, weight);
          accumulate(carSecond, -1, residual, weight);
        }
      }
    }
    for (const [key, gradient] of gradients) {
      const driver = key.startsWith('driver:');
      const step = driver ? driverStep : carStep;
      const decay = driver ? driverDecay : carDecay;
      values.set(key, Math.max(-200, Math.min(200,
        (1 - decay) * get(key) + step * gradient / exposures.get(key))));
    }
    post.push({
      drivers: new Map(weekend.rows.map((row) => [String(row.driverId), { m: get(`driver:${row.driverId}`) }])),
      cars: new Map(weekend.rows.map((row) => [String(row.constructorId), { m: get(keyOf('race', String(row.constructorId))) }])),
    });
    qualifyingPost.push({
      drivers: post.at(-1).drivers,
      cars: new Map(weekend.rows.map((row) => [String(row.constructorId), { m: get(keyOf('qual', String(row.constructorId))) }])),
    });
  }
  return {
    race: { name: 'joint-duel-factor-race', session: 'race', k: LOG_ODDS_PER_POINT, pre, post, z },
    qual: { name: 'joint-duel-factor-qual', session: 'qual', k: LOG_ODDS_PER_POINT,
      pre: qualifyingPre, post: qualifyingPost, z: qualifyingZ },
  };
}
