// Small statistics toolbox for the evaluation harness: seeded random numbers, regression, logistic calibration and a
// bootstrap that resamples whole seasons (the weekends of a season are not independent, so a plain bootstrap over
// rows would make every interval too narrow).

export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(next(), 1e-300);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  const gumbel = () => -Math.log(-Math.log(Math.min(1 - 1e-12, Math.max(1e-12, next()))));
  // Student t with `df` degrees of freedom (df integer >= 1), from a normal over the root of a chi-square
  const t = (df) => {
    let chi = 0;
    for (let i = 0; i < df; i++) chi += normal() ** 2;
    return normal() / Math.sqrt(chi / df);
  };
  return { next, normal, gumbel, t };
}

export const sum = (a) => a.reduce((s, v) => s + v, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : NaN);
export const sd = (a) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(sum(a.map((v) => (v - m) ** 2)) / (a.length - 1));
};
export const rms = (a) => (a.length ? Math.sqrt(sum(a.map((v) => v * v)) / a.length) : NaN);
export const meanAbs = (a) => (a.length ? sum(a.map(Math.abs)) / a.length : NaN);
export function quantile(a, q) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const p = (s.length - 1) * q;
  const lo = Math.floor(p);
  const hi = Math.ceil(p);
  return s[lo] + (s[hi] - s[lo]) * (p - lo);
}
export const median = (a) => quantile(a, 0.5);
export function wmean(values, weights) {
  let s = 0;
  let w = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i] * weights[i];
    w += weights[i];
  }
  return w ? s / w : NaN;
}
export function corr(x, y) {
  if (x.length < 3) return NaN;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}

/** Least squares y = a + b x. Returns { a, b, r, n }. */
export function ols(x, y) {
  const n = x.length;
  if (n < 3) return { a: NaN, b: NaN, r: NaN, n };
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
  }
  const b = sxx > 1e-12 ? sxy / sxx : NaN;
  return { a: my - b * mx, b, r: corr(x, y), n };
}

/** Slope of y on x through the origin. */
export function olsOrigin(x, y) {
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += x[i] * y[i];
    sxx += x[i] * x[i];
  }
  return sxx > 1e-12 ? sxy / sxx : NaN;
}

const expit = (z) => 1 / (1 + Math.exp(-z));
export const nll = (z, o) => {
  // -log sigma(z) if o else -log sigma(-z), stable for large |z|
  const u = o ? z : -z;
  return u > 0 ? Math.log1p(Math.exp(-u)) : -u + Math.log1p(Math.exp(u));
};

/**
 * Weighted logistic calibration of outcomes `o` on log-odds `z`: P(o = 1) = sigmoid(a + b z).
 * `intercept: false` fixes a = 0. Returns { a, b } (NaN when the data cannot pin them down).
 */
export function logisticCalibration(z, o, w = null, { intercept = true } = {}) {
  const n = z.length;
  if (n < 5) return { a: NaN, b: NaN };
  let a = 0;
  let b = 1;
  for (let it = 0; it < 30; it++) {
    let g0 = 0;
    let g1 = 0;
    let h00 = 0;
    let h01 = 0;
    let h11 = 0;
    for (let i = 0; i < n; i++) {
      const wi = w ? w[i] : 1;
      const p = expit(a + b * z[i]);
      const r = wi * (o[i] - p);
      const v = wi * p * (1 - p);
      g0 += r;
      g1 += r * z[i];
      h00 += v;
      h01 += v * z[i];
      h11 += v * z[i] * z[i];
    }
    h11 += 1e-9;
    h00 += 1e-9;
    let da;
    let db;
    if (intercept) {
      const det = h00 * h11 - h01 * h01;
      if (!(Math.abs(det) > 1e-14)) return { a: NaN, b: NaN };
      da = (h11 * g0 - h01 * g1) / det;
      db = (h00 * g1 - h01 * g0) / det;
    } else {
      da = 0;
      db = g1 / h11;
    }
    // a damped step keeps separable data from running away
    const damp = Math.min(1, 3 / Math.max(1e-9, Math.abs(da) + Math.abs(db)));
    a += damp * da;
    b += damp * db;
    if (Math.abs(da) + Math.abs(db) < 1e-8) break;
  }
  return Number.isFinite(a) && Number.isFinite(b) ? { a, b } : { a: NaN, b: NaN };
}

/** Minimise a unimodal f on [lo, hi] by golden-section search. */
export function minimise(f, lo, hi, iters = 60) {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo;
  let b = hi;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < iters; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

/**
 * Bootstrap of `stat(items)` that resamples whole clusters (seasons). `clusterOf(item)` names the cluster.
 * Returns { est, lo, hi, se, n, clusters } with a 95% percentile interval; est is the statistic on all items.
 */
export function clusterBootstrap(items, clusterOf, stat, { B = 300, seed = 7 } = {}) {
  const est = stat(items);
  const groups = new Map();
  for (const it of items) {
    const key = clusterOf(it);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const lists = [...groups.values()];
  const out = { est, lo: NaN, hi: NaN, se: NaN, n: items.length, clusters: lists.length };
  if (lists.length < 3 || !Number.isFinite(est)) return out;
  const r = rng(seed);
  const draws = [];
  for (let b = 0; b < B; b++) {
    const pool = [];
    for (let c = 0; c < lists.length; c++) {
      const g = lists[Math.floor(r.next() * lists.length)];
      for (const it of g) pool.push(it);
    }
    const v = stat(pool);
    if (Number.isFinite(v)) draws.push(v);
  }
  if (draws.length < 20) return out;
  out.lo = quantile(draws, 0.025);
  out.hi = quantile(draws, 0.975);
  out.se = sd(draws);
  return out;
}

/** Format an estimate with its interval, for text reports. */
export function fmtCI(r, digits = 3) {
  if (!r || !Number.isFinite(r.est)) return 'n/a';
  const f = (v) => (Number.isFinite(v) ? v.toFixed(digits) : '?');
  return Number.isFinite(r.lo) ? `${f(r.est)} [${f(r.lo)}, ${f(r.hi)}]` : f(r.est);
}
