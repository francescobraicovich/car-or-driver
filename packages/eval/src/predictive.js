// How well do the ratings forecast? Ratings-alone forecasts of every pairwise observation of every weekend, from
// earlier weekends only (the filters are forward-only), scored on the exam's own weights.
//
// One row per observation: { i, year, session, o, w, same, src, wet, z (raw log-odds, uncertainty folded in),
// vari, dist }. A calibration multiplier c (fitted on the fit window, as the project does) scales z; the multiplier
// is the only thing fitted, so a later window is a fair test. Everything is invariant to which driver of a pair is
// called x: calibration is a slope through the origin and reliability is read on the favourite's side.
import { logisticCalibration, minimise, nll, quantile } from './stats.js';
import { WINDOWS } from './timeline.js';

const clampP = (p) => Math.min(1 - 1e-12, Math.max(1e-12, p));

/**
 * Teammate-graph distance between two drivers as of a weekend: 1 = teammates within the last `years` seasons,
 * 2 = a shared teammate, 3 = a chain of two, up to `maxDepth`; 0 = not connected within that reach. This is how well two drivers are linked through
 * movers, which is what makes a cross-team comparison identified at all.
 */
export function linkDistances(idx, { years = 3, maxDepth = 6 } = {}) {
  const pairsOf = idx.timeline.map((w, i) => {
    const out = [];
    for (const l of idx.lineup[i].values())
      for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) out.push([l[a], l[b]]);
    return out;
  });
  const byYear = new Map();
  idx.timeline.forEach((w, i) => {
    if (!byYear.has(w.year)) byYear.set(w.year, []);
    byYear.get(w.year).push(i);
  });
  const add = (adj, a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  const priorCache = new Map();
  const prior = (year) => {
    if (!priorCache.has(year)) {
      const adj = new Map();
      for (let y = year - years; y < year; y++) for (const i of byYear.get(y) || []) for (const [a, b] of pairsOf[i]) add(adj, a, b);
      priorCache.set(year, adj);
    }
    return priorCache.get(year);
  };
  const cur = new Map(); // current season's pairs so far
  let curYear = null;
  let curAdj = new Map();
  const results = [];
  idx.timeline.forEach((w, i) => {
    if (w.year !== curYear) {
      curYear = w.year;
      curAdj = new Map();
      cur.clear();
    }
    const base = prior(w.year);
    const nb = (d) => [...(base.get(d) || []), ...(curAdj.get(d) || [])];
    const dist = new Map();
    const drivers = [...idx.teamAt[i].keys()];
    for (const s of drivers) {
      const seen = new Map([[s, 0]]);
      let frontier = [s];
      for (let depth = 1; depth <= maxDepth; depth++) {
        const next = [];
        for (const u of frontier) for (const v of nb(u)) if (!seen.has(v)) (seen.set(v, depth), next.push(v));
        frontier = next;
      }
      dist.set(s, seen);
    }
    results.push(dist);
    for (const [a, b] of pairsOf[i]) add(curAdj, a, b);
  });
  return (i, x, y) => results[i].get(x)?.get(y) ?? 0;
}

/** Flat rows of all observations of a rating run. */
export function observationRows(idx, run, distance = null) {
  const rows = [];
  idx.timeline.forEach((w, i) => {
    const z = run.z[i];
    w.obs[run.session].forEach((ob, q) => {
      rows.push({
        i,
        year: w.year,
        session: run.session,
        o: ob.o,
        w: ob.w,
        same: !!ob.same,
        src: ob.src,
        wet: w.wet,
        x: ob.x,
        y: ob.y,
        z: z.adj[q],
        zPlain: z.plain[q],
        vari: z.vari ? z.vari[q] : NaN,
        dist: distance && !ob.same ? distance(i, ob.x, ob.y) : NaN,
      });
    });
  });
  return rows;
}

/** The multiplier on z that minimises the weighted log-loss over the rows picked. */
export const fitSlope = (rows) =>
  rows.length < 20
    ? NaN
    : minimise(
        (c) => {
          let s = 0;
          for (const r of rows) s += r.w * nll(c * r.z, r.o);
          return s;
        },
        0.2,
        3,
        50,
      );

function scoreRows(rows, c) {
  let w = 0;
  let loss = 0;
  let brier = 0;
  let hits = 0;
  for (const r of rows) {
    const p = clampP(1 / (1 + Math.exp(-c * r.z)));
    w += r.w;
    loss += r.w * nll(c * r.z, r.o);
    brier += r.w * (r.o - p) ** 2;
    hits += r.w * +(p > 0.5 === !!r.o);
  }
  return w
    ? { loss: loss / w, brier: brier / w, acc: hits / w, weight: w, n: rows.length }
    : { loss: NaN, brier: NaN, acc: NaN, weight: 0, n: 0 };
}

/** Reliability in bins of the favourite's predicted probability: observed frequency against predicted. */
export function reliability(rows, c, bins = 8) {
  const edges = Array.from({ length: bins + 1 }, (_, b) => 0.5 + (0.5 * b) / bins);
  const acc = Array.from({ length: bins }, () => ({ w: 0, p: 0, y: 0, n: 0 }));
  for (const r of rows) {
    const pFav = Math.max(1 / (1 + Math.exp(-c * r.z)), 1 / (1 + Math.exp(c * r.z)));
    const yFav = r.z * c >= 0 ? r.o : 1 - r.o; // did the favourite win
    const b = Math.min(bins - 1, Math.floor(((pFav - 0.5) / 0.5) * bins));
    const a = acc[b];
    a.w += r.w;
    a.p += r.w * pFav;
    a.y += r.w * yFav;
    a.n++;
  }
  const tot = acc.reduce((s, a) => s + a.w, 0);
  const rowsOut = acc.map((a, b) => ({
    lo: edges[b],
    hi: edges[b + 1],
    n: a.n,
    p: a.w ? a.p / a.w : NaN,
    freq: a.w ? a.y / a.w : NaN,
    weight: a.w,
  }));
  const ece = tot ? acc.reduce((s, a) => s + (a.w ? (a.w / tot) * Math.abs(a.y / a.w - a.p / a.w) : 0), 0) : NaN;
  return { bins: rowsOut, ece };
}

/** Calibration slope (through the origin) of the rows as they are (c applied first): 1 = right on average. */
const calSlope = (rows, c) => {
  const f = logisticCalibration(
    rows.map((r) => c * r.z),
    rows.map((r) => r.o),
    rows.map((r) => r.w),
    { intercept: false },
  );
  return f.b;
};

const PAIR_TYPES = [
  ['all', () => true],
  ['mates', (r) => r.same],
  ['cars', (r) => !r.same],
];

/**
 * @param {object} idx
 * @param {{ race: object, qual?: object }} runs   rating runs by session
 * @param {{ fitWindow?: object, windows?: object[], lastYear?: number }} [opts]
 * @returns {{ slopes, table, combined, calibration, walkForward, bySource, byWet, byVariance, byLink, reliability, headline }}
 */
export function predictiveMetrics(idx, runs, { fitWindow = WINDOWS[0], windows = WINDOWS, distance = null } = {}) {
  const sessions = Object.keys(runs).filter((s) => runs[s]);
  const rowsBy = Object.fromEntries(sessions.map((s) => [s, observationRows(idx, runs[s], distance)]));
  const inWin = (win) => (r) => r.year >= win.from && r.year <= win.to;
  const slopes = Object.fromEntries(sessions.map((s) => [s, fitSlope(rowsBy[s].filter(inWin(fitWindow)))]));
  const usable = windows.filter((win) => sessions.some((s) => rowsBy[s].some(inWin(win))));

  // loss by window x session x pair type, plus the two sessions pooled ("combined": every observation, one multiplier each)
  const table = [];
  const headline = {};
  for (const win of usable) {
    for (const [pt, keep] of PAIR_TYPES) {
      const cell = { window: win.id, label: win.label, pair: pt };
      let w = 0;
      let l = 0;
      for (const s of sessions) {
        const rows = rowsBy[s].filter((r) => inWin(win)(r) && keep(r));
        const sc = scoreRows(rows, slopes[s]);
        cell[s] = sc;
        if (sc.weight) {
          w += sc.weight;
          l += sc.loss * sc.weight;
        }
      }
      cell.combined = w ? l / w : NaN;
      table.push(cell);
      for (const s of sessions) headline[`predictive.loss.${s}.${pt}.${win.id}`] = cell[s].loss;
      headline[`predictive.loss.combined.${pt}.${win.id}`] = cell.combined;
    }
  }

  // honest slope: refit on everything before each year (walk-forward) and score that year with it
  const walkForward = {};
  for (const s of sessions) {
    const years = [...new Set(rowsBy[s].map((r) => r.year))].sort((a, b) => a - b);
    const perYear = [];
    for (const y of years) {
      if (y < fitWindow.to + 1) continue;
      const past = rowsBy[s].filter((r) => r.year < y && r.year >= fitWindow.from);
      const c = fitSlope(past);
      if (!Number.isFinite(c)) continue;
      perYear.push({
        year: y,
        c,
        ...scoreRows(
          rowsBy[s].filter((r) => r.year === y),
          c,
        ),
      });
    }
    walkForward[s] = perYear;
    for (const win of usable) {
      const sel = perYear.filter((p) => p.year >= win.from && p.year <= win.to);
      const wt = sel.reduce((a, p) => a + p.weight, 0);
      if (wt) headline[`predictive.walkForward.${s}.${win.id}`] = sel.reduce((a, p) => a + p.loss * p.weight, 0) / wt;
    }
  }

  // calibration slopes and reliability, out of the fit window (the multiplier was fitted there)
  const evalWindows = usable.filter((w) => w.id !== fitWindow.id);
  const evalRows = (s, keep = () => true) => rowsBy[s].filter((r) => evalWindows.some((w) => inWin(w)(r)) && keep(r));
  const calibration = {};
  const slices = {};
  for (const s of sessions) {
    calibration[s] = {};
    for (const [pt, keep] of PAIR_TYPES) {
      const rows = evalRows(s, keep);
      calibration[s][pt] = calSlope(rows, slopes[s]);
      headline[`predictive.calSlope.${s}.${pt}`] = calibration[s][pt];
    }
    const rel = reliability(evalRows(s), slopes[s]);
    calibration[s].reliability = rel;
    headline[`predictive.ece.${s}`] = rel.ece;

    // by observation source
    slices[s] = { source: {}, wet: {}, variance: {}, link: {} };
    for (const src of new Set(rowsBy[s].map((r) => r.src))) {
      const rows = evalRows(s, (r) => r.src === src);
      if (rows.length >= 50) slices[s].source[src] = { ...scoreRows(rows, slopes[s]), calSlope: calSlope(rows, slopes[s]) };
    }
    if (s === 'race') {
      for (const [label, wet] of [
        ['dry', false],
        ['wet', true],
      ]) {
        const rows = evalRows(s, (r) => r.wet === wet);
        if (rows.length >= 50) slices[s].wet[label] = { ...scoreRows(rows, slopes[s]), calSlope: calSlope(rows, slopes[s]) };
      }
    }
    // by the model's own uncertainty: terciles of the variance of the gap (only for models that have one)
    const withVar = evalRows(s, (r) => Number.isFinite(r.vari));
    if (withVar.length > 300) {
      const cuts = [
        quantile(
          withVar.map((r) => r.vari),
          1 / 3,
        ),
        quantile(
          withVar.map((r) => r.vari),
          2 / 3,
        ),
      ];
      ['low', 'mid', 'high'].forEach((label, t) => {
        const rows = withVar.filter((r) =>
          t === 0 ? r.vari <= cuts[0] : t === 1 ? r.vari > cuts[0] && r.vari <= cuts[1] : r.vari > cuts[1],
        );
        slices[s].variance[label] = {
          ...scoreRows(rows, slopes[s]),
          calSlope: calSlope(rows, slopes[s]),
          meanSd: Math.sqrt(rows.reduce((a, r) => a + r.vari, 0) / rows.length),
        };
      });
      headline[`predictive.calSlope.${s}.highVariance`] = slices[s].variance.high.calSlope;
    }
    // by how well the two drivers of a cross-team pair are linked through shared teammates
    if (rowsBy[s].some((r) => Number.isFinite(r.dist))) {
      for (const [label, keep] of [
        ['former teammates', (d) => d === 1],
        ['one shared teammate', (d) => d === 2],
        ['two links', (d) => d === 3],
        ['three or more links', (d) => d >= 4],
        ['not connected', (d) => d === 0],
      ]) {
        const rows = evalRows(s, (r) => !r.same && keep(r.dist));
        if (rows.length >= 100) slices[s].link[label] = { ...scoreRows(rows, slopes[s]), calSlope: calSlope(rows, slopes[s]) };
      }
    }
  }

  return { slopes, table, calibration, walkForward, slices, rowsBy, headline };
}
