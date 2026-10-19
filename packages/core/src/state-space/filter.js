// Joint state-space estimate of driver and car pace (the ratings).
//
// State: one driver level D and one car level C per entity, plus an optional per-driver "new-stint"
// transient A, so that a driver's strength is S = D + A + C. Levels are random walks with their own variances
// (cars also take a winter jump). Each weekend the filter first forecasts every pairwise observation from the
// PRIOR state, then updates with a weighted Bradley-Terry likelihood of all that weekend's pairs (an iterated
// extended-Kalman / Laplace step that keeps the full covariance, tempered by `tau` because the pairs of one
// weekend are strongly dependent). It is a forward filter: a rating after a weekend uses only that weekend
// and earlier ones.
//
// The observations are the exam's own: finishing order, like-for-like lap pace, retirement snapshots and
// qualifying pairs, with the exam's weights (see observations.js). Race and qualifying run as two independent
// filters. No DOM, no globals.
//
// A car is a team, not a constructor id: `ctx.carOf` maps every constructor id to the car it belongs to, so a
// team that only changed its name keeps its level (see carLineage in build.js). Everything returned stays keyed
// by constructor id.

export const STATE_SPACE_WINDOW = 100; // weekends after which an unseen entity stops carrying covariance

export const STATE_SPACE_DEFAULTS = {
  sdD: 20, // prior sd of a driver level
  sdNew: 20, // prior sd of a driver at his first appearance
  sdC: 35, // prior sd of a car level
  rho: 0.9, // winter persistence of a car level
  winterC: 25, // winter innovation sd of a car
  raceC: 2, // per-weekend drift sd of a car
  yearD: 5, // yearly drift sd of a driver
  raceD: 0, // per-weekend drift sd of a driver
  tau: 0.05, // likelihood weight (pairs are strongly dependent)
  thetaT: 1, // extra weight of teammate pairs in the likelihood
  mPace: 1, // learning weight of lap-pace pairs relative to the exam's
  mPart: 1, // learning weight of retirement-snapshot pairs relative to the exam's
  s: 75, // Elo scale of the likelihood (rating points per factor ten in odds)
  iters: 3, // Laplace iterations per weekend
  shrinkM: 1, // at a team change the driver's level is multiplied by this (1 = off)
  sdJ: 0, // jump sd of a driver level at a team change
  sdA: 0, // initial sd of the new-stint transient (0 = no transient)
  rhoA: 0.8, // per-weekend persistence of the transient
  // A driver who first appears after the first season of data is a rookie.
  relStart: 0, // 1: a driver without a teammate to anchor to starts at the current field's average level plus muNew (levels have no absolute zero); 0: at 0 plus muNew
  muNew: 0, // offset of that start (points)
  sdR: 0, // > 0: a rookie also gets a temporary debut adjustment with this starting spread, fading by rhoR per weekend
  dipR: 0, // its starting mean is minus this (points): rookies tend to start slower than they end up
  rhoR: 0.85, // per-weekend persistence of the debut adjustment
  sdRel: 0, // > 0: a rookie starts at his veteran teammates' level plus a gap with this sd, correlated with them (0 = fixed prior)
  muRel: 0, // the mean of that gap, in points (negative: rookies start below their teammate)
  rookieN: 5, // for this many weekends a rookie counts as new
  mRookieCross: 1, // weight multiplier for a new driver's comparisons against other teams (1 = off; 0 = teammates only)
  // Uncertainty scales (the means, and so every forecast built on them, do not change): the likelihood is tempered by `tau` because
  // the pairs of a weekend are dependent, which also leaves the posterior covariance too small. `varInfl` multiplies the variance the
  // filter REPORTS (the sd of each rating) and `varInflPred` the variance a FORECAST folds into its probability (the prior predictive
  // variance of each observation, and the pair covariance of `latest`, see `scale`). 1 = the filter's own covariance.
  varInfl: 1,
  varInflPred: 1,
  // A car's level gets extra variance (an sd, in points) when an established driver arrives at its team: a team-level surprise at a
  // lineup change can then be absorbed by the car instead of the driver who stayed (0 = off).
  sdCL: 0,
  // ... or less: the car's variance (and its covariances, as a congruence so the covariance stays valid) is multiplied by this when an
  // established driver arrives, so that the newcomer's rating, not the car, takes up what he does not match (1 = off).
  carShrinkL: 1,
  // The likelihood weight of a wet weekend's pairs is multiplied by this (a wet race reshuffles the order more, so it teaches less); only
  // weekends flagged `wet` are touched (1 = off).
  tauWet: 1,
  // The likelihood weight of every pair that involves a driver in his first `moverN` weekends after a team change (an established driver
  // moving to another team) is multiplied by this, so that a move does not swing his rating more than it swings a driver who stayed (1 = off).
  mMover: 1,
  moverN: 5,
  // true: the posted rating of a driver is D + A (+ the qualifying offset), as before. false: A (the driver-team fit, reset at a team change) is
  // internal to the forecast and the posted rating is the portable level D (+ offset), so a team change moves nobody's displayed rating.
  rateA: true,
  // weight of the race-specific level D in the POSTED (portable) rating: D is scaled by this before the qualifying offset is added (1 = off). A forecast uses the full D.
  lambdaD: 1,
};

/** Gaussian elimination with partial pivoting: solve M X = B, M is n x n (array of rows), B is n x m. */
function solve(M, B, n, m) {
  const A = M.map((r, i) => Float64Array.from([...r, ...B[i]]));
  const w = n + m;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const piv = A[c][c];
    for (let j = c; j < w; j++) A[c][j] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (f === 0) continue;
      for (let j = c; j < w; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((r) => r.slice(n));
}

/**
 * @typedef {object} Obs        one pairwise observation: x was ahead of y when `o` = 1
 * @property {string} x         driver id
 * @property {string} y
 * @property {string} cx        constructor ids
 * @property {string} cy
 * @property {number} o         1 if x finished ahead (or was faster), else 0
 * @property {number} w         the exam's scoring weight (teammate pairs include the teammate multiplier)
 * @property {boolean} same     both drivers drive for the same constructor
 * @property {string} src       'finish' | 'paceW' | 'pace' | 'partial' | 'qual'
 *
 * @typedef {object} Weekend
 * @property {number} year
 * @property {{ driverId: string, constructorId: string }[]} rows   everyone who took part (race or qualifying)
 * @property {Obs[]} obs        observations of THIS session for the weekend (may be empty)
 */

/**
 * Run the filter over one session ('race' or 'qual') of a list of weekends in date order.
 *
 * @param {Weekend[]} weekends
 * @param {object} hyper        see STATE_SPACE_DEFAULTS
 * @param {object} ctx          { canon(constructorId) -> lineage-aware team id (did a driver move),
 *                              carOf(constructorId) -> car identity (default: the id itself), tmBoost }
 * @returns {{
 *   predictions: { mean: Float64Array, vari: Float64Array, varD: Float64Array }[],
 *   ratings: { drivers: Map<string, { m: number, sd: number, seen: boolean }>, cars: Map<string, { m: number, sd: number, seen: boolean }> }[],
 *   latest: { driverIds: string[], carIds: string[], mean: Float64Array, cov: Float64Array[] } | null,
 *   hyper: object,
 * }}
 *   predictions[k]  prior predictive of each observation of weekend k, as the gap S_x - S_y in rating points:
 *                   its mean, its variance, and the variance of the driver-only part of the gap.
 *   ratings[k]      posterior after weekend k, for everyone in that weekend's rows: driver and car levels (driver
 *                   level includes the new-stint transient) with their standard deviations relative to the field
 *                   average, which is what ratings measure. `seen`: the entity has had at least one observation.
 *   latest          posterior after the last weekend with a forecast step added, for pair uncertainty:
 *                   means and covariance of [driver levels..., car levels...].
 */
export function runStateSpace(weekends, hyper = {}, ctx) {
  const h = { ...STATE_SPACE_DEFAULTS, ...hyper };
  const { canon, tmBoost } = ctx;
  const carOf = ctx.carOf ?? ((id) => id);
  // Optional known per-weekend offsets (points) added to a driver's strength: ctx.offsets[wi] is a Map driverId -> points, or absent.
  // The cross-session link: the race filter reads beta times the qualifying filter's driver rating (known before the weekend) as the
  // mean of a driver's strength, and its own driver level D becomes the race-specific residual. Not part of the state.
  // ctx.offsets[wi] is what a forecast of weekend wi may use (qualifying up to the weekend before); ctx.offsetsPost[wi] adds that weekend's
  // own qualifying, which is known by the race: it enters the update with the weekend's results and the rating posted after it.
  const offsets = ctx.offsets ?? null;
  const offsetsPost = ctx.offsetsPost ?? ctx.offsets ?? null;
  let curOff = null; // forecast offsets of the weekend being processed
  let curOffPost = null; // offsets for its update and its posted rating
  const offOf = (id) => (curOff ? (curOff.get(id) ?? 0) : 0);
  const offPostOf = (id) => (curOffPost ? (curOffPost.get(id) ?? 0) : 0);
  // The same for cars (keyed by constructor id): ctx.carOffsets / ctx.carOffsetsPost.
  const cOffsets = ctx.carOffsets ?? null;
  const cOffsetsPost = ctx.carOffsetsPost ?? ctx.carOffsets ?? null;
  let curCOff = null;
  let curCOffPost = null;
  // Known arrival adaptation (ctx.adapt[wi]: Map driverId -> points, <= 0): a deterministic function of the weekends since a driver joined a new team, in forecasts
  // and in the update, never in the posted rating (state-space/qualifying-link.js `arrivalOffsets`).
  const adaptArr = ctx.adapt ?? null;
  let curAdapt = null;
  const adaptOf = (id) => (curAdapt ? (curAdapt.get(id) ?? 0) : 0);
  const cOffOf = (id) => (curCOff ? (curCOff.get(id) ?? 0) : 0);
  const cOffPostOf = (id) => (curCOffPost ? (curCOffPost.get(id) ?? 0) : 0);
  // entity indices: drivers, then cars (one per car identity), then one transient per driver
  const driverIds = new Set();
  const carIds = new Set();
  for (const wk of weekends) {
    for (const r of wk.rows) {
      driverIds.add(r.driverId);
      carIds.add(r.constructorId);
    }
    for (const o of wk.obs) {
      driverIds.add(o.x);
      driverIds.add(o.y);
      carIds.add(o.cx);
      carIds.add(o.cy);
    }
  }
  const dList = [...driverIds];
  const cList = [...new Set([...carIds].map(carOf))];
  const ND = dList.length;
  const N0 = ND + cList.length;
  const N = N0 + ND;
  const di = new Map(dList.map((id, i) => [id, i]));
  const carIndex = new Map(cList.map((car, i) => [car, ND + i]));
  const ci = new Map([...carIds].map((id) => [id, carIndex.get(carOf(id))])); // constructor id -> car entity
  const ai = (id) => N0 + di.get(id);

  const m = new Float64Array(N);
  const P = Array.from({ length: N }, (_, i) => {
    const r = new Float64Array(N);
    r[i] = i < ND ? h.sdD ** 2 : i < N0 ? h.sdC ** 2 : 0;
    return r;
  });
  // covariance of two "effective" driver levels (level + transient) and of an effective level with a car
  const effCov = (i, j) => P[i][j] + P[i][N0 + j] + P[N0 + i][j] + P[N0 + i][N0 + j];
  const effDriverCar = (i, c) => P[i][c] + P[N0 + i][c];
  const born = new Uint8Array(N);
  const k = Math.LN10 / h.s;
  const lastTeam = new Map();
  const transientOn = h.sdA > 0 || h.sdR > 0;
  const activeA = new Set(); // transients that currently have variance
  const decayA = new Float64Array(N).fill(h.rhoA); // per-transient persistence (rookies fade at their own rate)
  const predictions = [];
  const ratings = [];
  const pres = []; // levels before each weekend, for forecasts of it (see forecastLevels)
  let prevYear = null;
  // Entities not seen for STATE_SPACE_WINDOW weekends (about five seasons) stop carrying covariance: their level and
  // variance are kept, their correlations with everyone else are dropped. This is what keeps the update cheap.
  const lastSeen = new Int32Array(N).fill(-1);
  const liveFlag = new Uint8Array(N);
  // Rookies: the year of a driver's first weekend and how many weekends he has had.
  const debutYear = new Int32Array(ND).fill(-1);
  const appearances = new Int32Array(ND);
  const firstYear = weekends.length ? weekends[0].year : 0;
  const isRookie = (d) => debutYear[d] > firstYear && appearances[d] < h.rookieN;
  const moveLeft = new Int32Array(ND); // weekends left in which a driver who changed team counts as a recent mover (mMover)

  for (const [wi, wk] of weekends.entries()) {
    curOff = offsets?.[wi] ?? null;
    curOffPost = offsetsPost?.[wi] ?? null;
    curCOff = cOffsets?.[wi] ?? null;
    curCOffPost = cOffsetsPost?.[wi] ?? null;
    curAdapt = adaptArr?.[wi] ?? null;
    // ---- time update
    if (prevYear !== null) {
      if (wk.year !== prevYear) {
        for (let i = ND; i < N0; i++) {
          if (!born[i]) continue;
          for (let j = 0; j < N; j++) {
            P[i][j] *= h.rho;
            P[j][i] *= h.rho;
          }
          m[i] *= h.rho;
        }
        for (let i = 0; i < N0; i++) if (born[i]) P[i][i] += i < ND ? h.yearD ** 2 : h.winterC ** 2;
      } else {
        for (let i = 0; i < N0; i++) if (born[i]) P[i][i] += i < ND ? h.raceD ** 2 : h.raceC ** 2;
      }
    }
    prevYear = wk.year;
    if (transientOn)
      for (const i of activeA) {
        for (let j = 0; j < N; j++) {
          P[i][j] *= decayA[i];
          P[j][i] *= decayA[i];
        }
        m[i] *= decayA[i];
        if (P[i][i] < 1e-4) {
          // faded away (sd below 0.01 points): drop it so it stops costing time
          for (let j = 0; j < N; j++) {
            P[i][j] = 0;
            P[j][i] = 0;
          }
          m[i] = 0;
          activeA.delete(i);
        }
      }
    // ---- team changes: a driver appearing for a different (lineage-aware) team than last time
    const lineupCars = new Set(); // cars whose lineup gained an established driver this weekend
    for (const r of wk.rows) {
      const team = canon(r.constructorId);
      const prev = lastTeam.get(r.driverId);
      lastTeam.set(r.driverId, team);
      if (debutYear[di.get(r.driverId)] < 0) debutYear[di.get(r.driverId)] = wk.year;
      if (prev === undefined || prev === team) continue;
      const d = di.get(r.driverId);
      if (!born[d]) continue;
      if (h.sdCL > 0 || h.carShrinkL < 1) lineupCars.add(ci.get(r.constructorId));
      if (h.mMover !== 1) moveLeft[d] = h.moverN;
      if (h.shrinkM < 1) {
        for (let j = 0; j < N; j++) {
          P[d][j] *= h.shrinkM;
          P[j][d] *= h.shrinkM;
        }
        m[d] *= h.shrinkM;
      }
      if (h.sdJ > 0) P[d][d] += h.sdJ ** 2;
      if (h.sdA > 0) {
        const a = ai(r.driverId);
        for (let j = 0; j < N; j++) {
          P[a][j] = 0;
          P[j][a] = 0;
        }
        m[a] = 0;
        P[a][a] = h.sdA ** 2;
        decayA[a] = h.rhoA;
        activeA.add(a);
      }
    }

    for (const c of lineupCars) {
      if (!born[c]) continue;
      if (h.carShrinkL < 1) {
        const f = Math.sqrt(h.carShrinkL);
        for (let j = 0; j < N; j++) {
          P[c][j] *= f;
          P[j][c] *= f;
        }
      }
      P[c][c] += h.sdCL ** 2;
    }

    const L = wk.obs.length;
    let pre = null;
    const infPred = h.varInflPred;
    const pred = { mean: new Float64Array(L), vari: new Float64Array(L), varD: new Float64Array(L) };
    predictions.push(pred);
    if (L) {
      // compiled observation columns
      const dx = Int32Array.from(wk.obs, (o) => di.get(o.x));
      const dy = Int32Array.from(wk.obs, (o) => di.get(o.y));
      const cx = Int32Array.from(wk.obs, (o) => ci.get(o.cx));
      const cy = Int32Array.from(wk.obs, (o) => ci.get(o.cy));
      // ---- births
      let fieldSum = 0;
      let fieldN = 0;
      if (h.relStart)
        for (const r of wk.rows) {
          const d = di.get(r.driverId);
          if (born[d]) {
            fieldSum += m[d];
            fieldN++;
          }
        }
      const fieldMean = fieldN ? fieldSum / fieldN : 0; // average level of the drivers already known on this grid
      const act = [];
      const local = new Map();
      const touch = (i) => {
        if (!local.has(i)) {
          local.set(i, act.length);
          act.push(i);
          if (!born[i]) {
            born[i] = 1;
            if (i < ND) {
              P[i][i] = h.sdNew ** 2;
              m[i] = (h.relStart ? fieldMean : 0) + h.muNew;
            }
            if (i < ND && h.sdR > 0 && debutYear[i] > firstYear) {
              // a rookie's temporary debut adjustment: starts below zero and fades
              const a = N0 + i;
              m[a] = -h.dipR;
              P[a][a] = h.sdR ** 2;
              decayA[a] = h.rhoR;
              activeA.add(a);
            }
          }
          if (i < N0) {
            lastSeen[i] = wi;
            liveFlag[i] = 1;
          }
        }
        return local.get(i);
      };
      for (let i = 0; i < N0; i++) {
        if (liveFlag[i] && wi - lastSeen[i] > STATE_SPACE_WINDOW) {
          for (let j = 0; j < N; j++)
            if (j !== i) {
              P[i][j] = 0;
              P[j][i] = 0;
            }
          liveFlag[i] = 0;
        }
      }
      // ---- a driver seen for the first time starts from his veteran teammates' level plus a gap, not from a fixed prior:
      //      D_new = mean of the teammates' D + delta, delta ~ N(muRel, sdRel^2), so he inherits their covariance
      if (h.sdRel > 0) {
        const newcomers = new Set();
        for (let q = 0; q < L; q++) for (const d of [dx[q], dy[q]]) if (!born[d]) newcomers.add(d);
        const veterans = new Map(); // constructor id -> drivers already born before this weekend
        for (const r of wk.rows) {
          const d = di.get(r.driverId);
          if (born[d] && !newcomers.has(d)) veterans.set(r.constructorId, [...(veterans.get(r.constructorId) || []), d]);
        }
        for (const r of wk.rows) {
          const i = di.get(r.driverId);
          const refs = newcomers.has(i) ? veterans.get(r.constructorId) : null;
          if (!refs?.length) continue;
          const w = 1 / refs.length;
          let mean = 0;
          let variance = h.sdRel ** 2;
          for (const t of refs) {
            mean += w * m[t];
            for (const u of refs) variance += w * w * P[t][u];
          }
          for (let j = 0; j < N; j++) {
            let c = 0;
            for (const t of refs) c += w * P[t][j];
            P[i][j] = c;
            P[j][i] = c;
          }
          P[i][i] = variance;
          m[i] = mean + h.muRel;
          born[i] = 1;
          lastSeen[i] = wi;
          liveFlag[i] = 1;
        }
      }
      for (let q = 0; q < L; q++) {
        touch(dx[q]);
        touch(dy[q]);
        touch(cx[q]);
        touch(cy[q]);
        touch(N0 + dx[q]);
        touch(N0 + dy[q]);
      }
      pre = forecastLevels(wk);
      // ---- prior predictive of every observation (gap = driver + transient + car, x minus y)
      const ent = new Int32Array(6);
      for (let q = 0; q < L; q++) {
        ent[0] = dx[q];
        ent[1] = N0 + dx[q];
        ent[2] = cx[q];
        ent[3] = dy[q];
        ent[4] = N0 + dy[q];
        ent[5] = cy[q];
        let mu = 0;
        let v = 0;
        let vd = 0;
        for (let u1 = 0; u1 < 6; u1++) {
          const i = ent[u1];
          const s1 = u1 < 3 ? 1 : -1;
          mu += s1 * m[i];
          const row = P[i];
          for (let u2 = 0; u2 < 6; u2++) {
            const c = s1 * (u2 < 3 ? 1 : -1) * row[ent[u2]];
            v += c;
            if (u1 !== 2 && u1 !== 5 && u2 !== 2 && u2 !== 5) vd += c; // driver-only part: no car entries
          }
        }
        pred.mean[q] =
          mu +
          (curOff ? offOf(wk.obs[q].x) - offOf(wk.obs[q].y) : 0) +
          (curCOff ? cOffOf(wk.obs[q].cx) - cOffOf(wk.obs[q].cy) : 0) +
          (curAdapt ? adaptOf(wk.obs[q].x) - adaptOf(wk.obs[q].y) : 0);
        pred.vari[q] = v * infPred;
        pred.varD[q] = vd * infPred;
      }
      // ---- measurement update
      const live = [];
      for (let i = 0; i < N0; i++) if (liveFlag[i]) live.push(i);
      for (const i of activeA) live.push(i);
      const nl = live.length;
      const a = act.length;
      const ma = act.map((i) => m[i]);
      let xc = ma.slice();
      let mu = null;
      let Jx = null;
      let Mmat = null;
      const Paa = act.map((i) => act.map((j) => P[i][j]));
      // Negative log posterior along the iteration, so that a step that overshoots can be shortened (see below). The
      // candidate level is ma + Paa y, so its prior term is y' Paa y / 2 and needs no matrix inverse.
      const om = new Float64Array(L);
      const oc = new Float64Array(L); // known offset of the gap
      const lx = new Int32Array(6 * L);
      for (let q = 0; q < L; q++) {
        const o = wk.obs[q];
        om[q] =
          h.tau *
          (wk.wet ? h.tauWet : 1) *
          (o.w / (o.same ? tmBoost : 1)) *
          (o.same ? h.thetaT : 1) *
          (o.src === 'paceW' || o.src === 'pace' ? h.mPace : o.src === 'partial' ? h.mPart : 1) *
          (!o.same && h.mRookieCross !== 1 && (isRookie(dx[q]) || isRookie(dy[q])) ? h.mRookieCross : 1) *
          (h.mMover !== 1 && (moveLeft[dx[q]] > 0 || moveLeft[dy[q]] > 0) ? h.mMover : 1);
        if (curOffPost) oc[q] = offPostOf(o.x) - offPostOf(o.y);
        if (curCOffPost) oc[q] += cOffPostOf(o.cx) - cOffPostOf(o.cy);
        if (curAdapt) oc[q] += adaptOf(o.x) - adaptOf(o.y);
        lx[6 * q] = local.get(dx[q]);
        lx[6 * q + 1] = local.get(N0 + dx[q]);
        lx[6 * q + 2] = local.get(cx[q]);
        lx[6 * q + 3] = local.get(dy[q]);
        lx[6 * q + 4] = local.get(N0 + dy[q]);
        lx[6 * q + 5] = local.get(cy[q]);
      }
      const negPost = (x, yv) => {
        let f = 0;
        for (let q = 0; q < L; q++) {
          const z =
            k * (oc[q] + x[lx[6 * q]] + x[lx[6 * q + 1]] + x[lx[6 * q + 2]] - x[lx[6 * q + 3]] - x[lx[6 * q + 4]] - x[lx[6 * q + 5]]);
          f += om[q] * (wk.obs[q].o ? Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z)));
        }
        for (let i = 0; i < a; i++) {
          let s = 0;
          for (let j = 0; j < a; j++) s += Paa[i][j] * yv[j];
          f += 0.5 * yv[i] * s;
        }
        return f;
      };
      let yCur = new Float64Array(a);
      let fCur = negPost(xc, yCur);
      for (let it = 0; it < h.iters; it++) {
        const gx = new Float64Array(a);
        Jx = Array.from({ length: a }, () => new Float64Array(a));
        const idx6 = new Int32Array(6);
        for (let q = 0; q < L; q++) {
          const o = wk.obs[q];
          idx6[0] = local.get(dx[q]);
          idx6[1] = local.get(N0 + dx[q]);
          idx6[2] = local.get(cx[q]);
          idx6[3] = local.get(dy[q]);
          idx6[4] = local.get(N0 + dy[q]);
          idx6[5] = local.get(cy[q]);
          const delta = oc[q] + xc[idx6[0]] + xc[idx6[1]] + xc[idx6[2]] - xc[idx6[3]] - xc[idx6[4]] - xc[idx6[5]];
          const p = 1 / (1 + Math.exp(-k * delta));
          const g = om[q] * k * (o.o - p);
          const hh = om[q] * k * k * p * (1 - p);
          for (let u1 = 0; u1 < 6; u1++) {
            const s1 = u1 < 3 ? 1 : -1;
            gx[idx6[u1]] += s1 * g;
            const row = Jx[idx6[u1]];
            for (let u2 = 0; u2 < 6; u2++) row[idx6[u2]] += s1 * (u2 < 3 ? 1 : -1) * hh;
          }
        }
        Mmat = Array.from({ length: a }, (_, i) => {
          const r = new Float64Array(a);
          for (let j = 0; j < a; j++) {
            let v = i === j ? 1 : 0;
            for (let kk = 0; kk < a; kk++) v += Jx[i][kk] * Paa[kk][j];
            r[j] = v;
          }
          return r;
        });
        const rhs = Array.from(gx, (v, i) => [v + Jx[i].reduce((acc, jv, j) => acc + jv * (xc[j] - ma[j]), 0)]);
        const yNew = solve(Mmat, rhs, a, 1).map((r) => r[0]);
        const levels = (yv) => {
          const out = Float64Array.from(m);
          for (const i of live) {
            let v = m[i];
            for (let kk = 0; kk < a; kk++) v += P[i][act[kk]] * yv[kk];
            out[i] = v;
          }
          return out;
        };
        // The full step is the usual iterated update (a Newton step on the negative log posterior). When a wide prior
        // makes it overshoot, so that the objective rises or is not finite, it is halved until it does not: a rating
        // cannot then be thrown far from where the data put it.
        let y = Float64Array.from(yNew);
        let cand = levels(y);
        let fNew = negPost(
          act.map((i) => cand[i]),
          y,
        );
        for (let s = 0.5; !(fNew <= fCur) && s > 1e-3; s /= 2) {
          y = Float64Array.from(yCur, (v, i) => v + s * (yNew[i] - v));
          cand = levels(y);
          fNew = negPost(
            act.map((i) => cand[i]),
            y,
          );
        }
        if (!(fNew <= fCur)) break; // no step lowers it: keep the previous estimate
        mu = cand;
        yCur = y;
        fCur = fNew;
        xc = act.map((i) => mu[i]);
      }
      mu ??= Float64Array.from(m);
      const JP = Array.from({ length: a }, (_, i) => {
        const r = new Float64Array(nl);
        for (let jj = 0; jj < nl; jj++) {
          let v = 0;
          for (let kk = 0; kk < a; kk++) v += Jx[i][kk] * P[act[kk]][live[jj]];
          r[jj] = v;
        }
        return r;
      });
      const X = solve(Mmat, JP, a, nl);
      // the columns of the active entities as they were before this update: P is overwritten in place below
      const Pa = live.map((i) => Float64Array.from(act, (c) => P[i][c]));
      for (let ii = 0; ii < nl; ii++) {
        const i = live[ii];
        for (let jj = 0; jj < nl; jj++) {
          const j = live[jj];
          let v = 0;
          for (let kk = 0; kk < a; kk++) v += Pa[ii][kk] * X[kk][jj];
          P[i][j] -= v;
        }
      }
      for (let ii = 0; ii < nl; ii++)
        for (let jj = ii + 1; jj < nl; jj++)
          P[live[ii]][live[jj]] = P[live[jj]][live[ii]] = (P[live[ii]][live[jj]] + P[live[jj]][live[ii]]) / 2;
      m.set(mu);
    }

    // ---- posterior ratings for everyone in this weekend's rows
    pres.push(pre ?? forecastLevels(wk));
    for (const r of wk.rows) {
      const d = di.get(r.driverId);
      appearances[d]++;
      if (moveLeft[d] > 0) moveLeft[d]--;
    }
    ratings.push(snapshot(wk));
  }

  /** Levels as forecast before the weekend (after the time update and births, before its observations): what a forecast of it may use. */
  function forecastLevels(wk) {
    // everyone with a row or in a pair: a driver can qualify without starting the race, so the session's pairs may name more
    const drivers = new Map();
    const rated = new Map(); // the rating as posted (see rateA): what a reader of the ratings would have seen
    const cars = new Map();
    const put = (d, c) => {
      drivers.set(d, m[di.get(d)] + m[N0 + di.get(d)] + offOf(d) + adaptOf(d));
      rated.set(d, h.lambdaD * m[di.get(d)] + (h.rateA ? m[N0 + di.get(d)] : 0) + offOf(d));
      cars.set(c, m[ci.get(c)] + cOffOf(c));
    };
    for (const r of wk.rows) put(r.driverId, r.constructorId);
    for (const o of wk.obs) {
      put(o.x, o.cx);
      put(o.y, o.cy);
    }
    return { drivers, cars, rated };
  }

  function snapshot(wk) {
    const dIds = [...new Set(wk.rows.map((r) => r.driverId))];
    const cIds = [...new Set(wk.rows.map((r) => r.constructorId))];
    const dI = dIds.map((id) => di.get(id));
    // one car per team even if a weekend lists it under two constructor ids
    const cI = [...new Set(cIds.map((id) => ci.get(id)))];
    const cIdOf = new Map(cIds.map((id) => [ci.get(id), id]).reverse()); // car entity -> a constructor id of it (for known offsets)
    const dm = dI.map((i, n) => h.lambdaD * m[i] + (h.rateA ? m[N0 + i] : 0) + offPostOf(dIds[n]));
    const cm = cI.map((i) => m[i] + cOffPostOf(cIdOf.get(i)));
    const meanD = dm.reduce((x, y) => x + y, 0) / (dm.length || 1);
    const meanC = cm.reduce((x, y) => x + y, 0) / (cm.length || 1);
    // sd of (level - field average): P_ii - (2/n) sum_j P_ij + (1/n^2) sum_jk P_jk
    const relSd = (idx, cov) => {
      const n = idx.length;
      let all = 0;
      const rowSum = idx.map((a) => {
        let s = 0;
        for (const b of idx) s += cov(a, b);
        all += s;
        return s;
      });
      return idx.map((a, ii) => Math.sqrt(Math.max(0, cov(a, a) - (2 / n) * rowSum[ii] + all / (n * n))));
    };
    const sf = Math.sqrt(h.varInfl);
    const dSd = relSd(dI, h.rateA ? effCov : (a, b) => P[a][b]).map((v) => v * sf);
    const cSd = relSd(cI, (a, b) => P[a][b]).map((v) => v * sf);
    return {
      drivers: new Map(
        dIds.map((id, n) => [
          id,
          { m: dm[n] - meanD, sd: dSd[n], seen: !!born[di.get(id)], n: appearances[di.get(id)], rookie: isRookie(di.get(id)) },
        ]),
      ),
      cars: new Map(
        cIds.map((id) => {
          const n = cI.indexOf(ci.get(id));
          return [id, { m: cm[n] - meanC, sd: cSd[n], seen: !!born[ci.get(id)] }];
        }),
      ),
    };
  }

  let latest = null;
  const lastWk = weekends[weekends.length - 1];
  if (lastWk) {
    const dIds = [...new Set(lastWk.rows.map((r) => r.driverId))];
    const cIds = [...new Set(lastWk.rows.map((r) => r.constructorId))];
    const dI = dIds.map((id) => di.get(id));
    const cI = cIds.map((id) => ci.get(id));
    const idx = [...dI, ...cI];
    const nd = dI.length;
    const cov = idx.map((a, ia) =>
      Float64Array.from(idx, (b, ib) => {
        if (ia < nd && ib < nd) return effCov(a, b);
        if (ia < nd) return effDriverCar(a, b);
        if (ib < nd) return effDriverCar(b, a);
        return P[a][b];
      }),
    );
    // one forecast step: the cars drift before the next weekend
    for (let ia = nd; ia < idx.length; ia++) cov[ia][ia] += h.raceC ** 2;
    latest = {
      driverIds: dIds,
      carIds: cIds,
      // one forecast step on the means too: a new-team or debut adjustment has faded by one weekend's factor
      mean: Float64Array.from(idx, (a, ia) =>
        ia < nd ? m[a] + decayA[N0 + a] * m[N0 + a] + offPostOf(dIds[ia]) : m[a] + cOffPostOf(cIds[ia - nd]),
      ),
      cov,
      // how a reader scales `cov` (only present when a scale is set, so a default run is unchanged)
      ...(h.varInfl !== 1 || h.varInflPred !== 1 ? { scale: { report: h.varInfl, forecast: h.varInflPred } } : {}),
    };
  }
  return { predictions, ratings, pre: pres, latest, hyper: h };
}
