// Joint Gaussian approximation to a tempered pairwise logistic likelihood.
// One shared driver and driver-team fit, with separate race/qualifying cars.
const k = Math.LN10 / 75;
export const JOINT_GAUSSIAN_SETTINGS = Object.freeze({
  carVariance: Object.freeze({ race: 27 ** 2, qual: 59 ** 2 }), fitVariance: 12 ** 2,
  annualDriverVariance: 4 ** 2, carDrift: Object.freeze({ race: 0.91 ** 2, qual: 5.71 ** 2 }),
  carWinter: Object.freeze({ race: Object.freeze([0.8, 8.75 ** 2]), qual: Object.freeze([1, 32.5 ** 2]) }), fitRetention: 0.97,
  tau: Object.freeze({ race: 0.03846, qual: 0.07 }), teammate: 2.744,
});
const settings = JOINT_GAUSSIAN_SETTINGS;
const logistic = (x) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));

// Solve A X = B with partial pivoting; A is positive definite after the
// covariance multiplication even though this representation is asymmetric.
function solve(matrix, right) {
  const n = matrix.length, width = right[0].length;
  const rows = matrix.map((row, i) => Float64Array.from([...row, ...right[i]]));
  for (let j = 0; j < n; j++) {
    let pivot = j;
    for (let i = j + 1; i < n; i++) if (Math.abs(rows[i][j]) > Math.abs(rows[pivot][j])) pivot = i;
    [rows[j], rows[pivot]] = [rows[pivot], rows[j]];
    const divisor = rows[j][j];
    for (let c = j; c < n + width; c++) rows[j][c] /= divisor;
    for (let i = 0; i < n; i++) if (i !== j) {
      const factor = rows[i][j];
      for (let c = j; c < n + width; c++) rows[i][c] -= factor * rows[j][c];
    }
  }
  return rows.map((row) => row.slice(n));
}

export function jointGaussian({ timeline, prep }, { driverSd = 20, raceResidualSd = 0 } = {}) {
  const raceResidual = raceResidualSd > 0;
  const names = [], indices = new Map(), last = [], mean = [], covariance = [];
  const runs = Object.fromEntries(['race', 'qual'].map((session) => [session, { name: `joint-gaussian-${session}`, session, k, pre: [], post: [], z: [], drift: null }]));
  const carOf = prep.ctx.carOf;
  const driverKey = (id) => `driver:${id}`;
  const residualKey = (id) => `residual:${id}`;
  const carKey = (session, id) => `car:${session}:${carOf(id)}`;
  const fitKey = (id, constructor) => `fit:${id}:${carOf(constructor)}`;
  const ensure = (key, variance, weekend) => {
    if (!indices.has(key)) {
      indices.set(key, names.length); names.push(key); mean.push(0); last.push(weekend);
      for (const row of covariance) row.push(0);
      covariance.push(Array(names.length).fill(0)); covariance.at(-1)[names.length - 1] = variance;
    }
    const index = indices.get(key); last[index] = weekend; return index;
  };
  let previousYear = null;
  for (const [weekendIndex, weekend] of timeline.entries()) {
    // Discard stale correlations, retaining means and marginal variances.
    for (let i = 0; i < names.length; i++) if (weekendIndex - last[i] === 101)
      for (let j = 0; j < names.length; j++) if (i !== j) covariance[i][j] = covariance[j][i] = 0;
    const annual = previousYear !== null && previousYear !== weekend.year;
    previousYear = weekend.year;
    const retention = names.map((name) => name.startsWith('fit:') ? settings.fitRetention :
      annual && name.startsWith('car:') ? settings.carWinter[name.split(':')[1]][0] : 1);
    for (let i = 0; i < names.length; i++) {
      mean[i] *= retention[i];
      for (let j = 0; j < names.length; j++) covariance[i][j] *= retention[i] * retention[j];
      if (annual && (names[i].startsWith('driver:') || names[i].startsWith('residual:'))) covariance[i][i] += settings.annualDriverVariance;
      if (names[i].startsWith('car:')) {
        const session = names[i].split(':')[1];
        covariance[i][i] += settings.carDrift[session] + (annual ? settings.carWinter[session][1] : 0);
      }
    }
    const driver = (id) => ensure(driverKey(id), driverSd ** 2, weekendIndex);
    const residual = (id) => ensure(residualKey(id), raceResidualSd ** 2, weekendIndex);
    const car = (session, id) => ensure(carKey(session, id), settings.carVariance[session], weekendIndex);
    const fit = (id, constructor) => ensure(fitKey(id, constructor), settings.fitVariance, weekendIndex);
    for (const row of weekend.rows) {
      const d = String(row.driverId), c = String(row.constructorId);
      driver(d); if (raceResidual) residual(d); fit(d, c); for (const session of ['race', 'qual']) car(session, c);
    }
    const observations = [];
    for (const session of ['race', 'qual']) {
      const run = runs[session];
      const rows = weekend.rows.slice();
      for (const observation of weekend.obs[session]) rows.push(
        { driverId: observation.x, constructorId: observation.cx }, { driverId: observation.y, constructorId: observation.cy },
      );
      const drivers = new Map(rows.map((row) => [String(row.driverId), mean[driver(String(row.driverId))] + (raceResidual && session === 'race' ? mean[residual(String(row.driverId))] : 0)]));
      const cars = new Map(rows.map((row) => [String(row.constructorId), mean[car(session, String(row.constructorId))]]));
      run.pre.push({ drivers, rated: drivers, cars });
      const plain = [], adjusted = [], variance = [];
      for (const observation of weekend.obs[session]) {
        const terms = new Map();
        for (const [index, coefficient] of [[driver(observation.x), 1], [fit(observation.x, observation.cx), 1], [car(session, observation.cx), 1],
          [driver(observation.y), -1], [fit(observation.y, observation.cy), -1], [car(session, observation.cy), -1],
          ...(raceResidual && session === 'race' ? [[residual(observation.x), 1], [residual(observation.y), -1]] : [])])
          terms.set(index, (terms.get(index) ?? 0) + coefficient);
        const features = [...terms].filter(([, coefficient]) => coefficient);
        const gap = features.reduce((sum, [i, x]) => sum + x * mean[i], 0);
        let v = 0;
        for (const [i, x] of features) for (const [j, y] of features) v += x * y * covariance[i][j];
        plain.push(k * gap); variance.push(v); adjusted.push(k * gap / Math.sqrt(1 + Math.PI / 8 * k * k * Math.max(0, v)));
        const weight = settings.tau[session] * observation.w / (observation.same ? prep.ctx.tmBoost : 1) *
          (observation.same ? settings.teammate : 1) * (session === 'race' ?
            (observation.src === 'pace' || observation.src === 'paceW' ? 25.62890625 : observation.src === 'partial' ? 38.443359375 : 1) : 1);
        observations.push({ features, outcome: observation.o, weight });
      }
      run.z.push({ plain: Float64Array.from(plain), adj: Float64Array.from(adjusted), vari: Float64Array.from(variance) });
    }
    const active = [...new Set(observations.flatMap((observation) => observation.features.map(([index]) => index)))];
    if (active.length) {
      const local = new Map(active.map((index, i) => [index, i]));
      const live = names.map((_, i) => i).filter((i) => weekendIndex - last[i] <= 100);
      const prior = active.map((i) => mean[i]);
      const paa = active.map((i) => active.map((j) => covariance[i][j]));
      let current = prior.slice(), hessian, system, solution;
      for (let iteration = 0; iteration < 3; iteration++) {
        const gradient = Array(active.length).fill(0);
        hessian = Array.from({ length: active.length }, () => Array(active.length).fill(0));
        for (const observation of observations) {
          const f = observation.features.map(([i, x]) => [local.get(i), x]);
          const gap = f.reduce((sum, [i, x]) => sum + x * current[i], 0);
          const p = logistic(k * gap), g = observation.weight * k * (observation.outcome - p), h = observation.weight * k * k * p * (1 - p);
          for (const [i, x] of f) { gradient[i] += x * g; for (const [j, y] of f) hessian[i][j] += x * y * h; }
        }
        system = hessian.map((row, i) => paa.map((_, j) => (i === j ? 1 : 0) + row.reduce((sum, x, q) => sum + x * paa[q][j], 0)));
        const right = gradient.map((g, i) => [g + hessian[i].reduce((sum, x, j) => sum + x * (current[j] - prior[j]), 0)]);
        solution = solve(system, right).map((row) => row[0]);
        current = paa.map((row, i) => prior[i] + row.reduce((sum, x, j) => sum + x * solution[j], 0));
      }
      for (const i of live) mean[i] += active.reduce((sum, j, q) => sum + covariance[i][j] * solution[q], 0);
      const right = hessian.map((row) => live.map((i) => row.reduce((sum, x, q) => sum + x * covariance[active[q]][i], 0)));
      const correction = solve(system, right);
      const priorColumns = live.map((i) => active.map((j) => covariance[i][j]));
      for (let a = 0; a < live.length; a++) for (let b = 0; b < live.length; b++)
        covariance[live[a]][live[b]] -= priorColumns[a].reduce((sum, x, q) => sum + x * correction[q][b], 0);
      for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
        const i = live[a], j = live[b]; covariance[i][j] = covariance[j][i] = (covariance[i][j] + covariance[j][i]) / 2;
      }
    }
    for (const session of ['race', 'qual']) runs[session].post.push({
      drivers: new Map(weekend.rows.map((row) => { const id = String(row.driverId), i = driver(id); const r = raceResidual && session === 'race' ? residual(id) : null; return [id, { m: mean[i] + (r === null ? 0 : mean[r]), sd: Math.sqrt(Math.max(0, covariance[i][i] + (r === null ? 0 : covariance[r][r] + 2 * covariance[i][r]))), seen: true }]; })),
      cars: new Map(weekend.rows.map((row) => { const id = String(row.constructorId), i = car(session, id); return [id, { m: mean[i], sd: Math.sqrt(Math.max(0, covariance[i][i])), seen: true }]; })),
    });
  }
  return runs;
}
