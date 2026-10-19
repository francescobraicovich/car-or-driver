// Simulator v2: synthetic worlds with the structure the real data has and the v1 worlds leave out.
//
// v1 (synthetic.js) draws ONE performance per driver per weekend (level plus Gumbel noise) and derives every observation from that
// ranking. Real weekends have lap times in stints, retirements, rain, safety cars, strategy luck, development steps, a driver-car fit and a
// qualifying session that is related to the race but not the same. v2 simulates those mechanisms and then builds the observations with the
// exam's OWN code (buildRaceObservations, buildQualObservations, parseLapPace and the weights of elo-core.js), so the `finish`, `paceW`,
// `pace`, `partial` and `qual` observations come out of simulated lap times, results and snapshots exactly as they do from the real files.
//
// Opt-in: `syntheticWorld(..., { version: 2, ... })` or syntheticStudy(..., { world: { version: 2 } }). v1 is untouched.
//
// What is real and what is simulated. The calendar is real (who raced for which team at every weekend, the moves, renames and takeovers,
// the curated wet flags, which weekends have lap data and which have qualifying). The levels of drivers and cars follow the shipped
// settings' dynamics (as in v1) plus: career curves, development steps of cars (upgrades), a number-one driver effect, a persistent
// driver-car fit, rookie learning, and a true change of a driver at a team move. Race and qualifying share their latent world (the
// innovations are correlated, not equal) and have their own noise. The truth the recovery metrics compare with is the persistent driver
// level and car level of the requested session, as in v1: the driver-car fit and the number-one effect are performance, not skill.
import { rng } from './stats.js';
import { buildRaceObservations } from '../../core/src/observations.js';
import { parseLapPace } from '../../core/src/lap-pace.js';
import { buildQualObservations } from '../../core/src/qualifying.js';
import { ELO_EXAM } from '../../core/src/exam.js';

const SESSIONS = ['race', 'qual'];

/** Defaults of the v2 mechanisms. The per-session dynamics (sdC, winterC, ...) come from the settings, see `worldParamsV2`. */
export const WORLD_V2_DEFAULTS = {
  version: 2,
  // ---- latent world
  rCar: 0.8, // correlation of the race and qualifying innovations of a car
  rDrv: 0.7, // ... of a driver
  driverScale: 0.6, // multiplies every driver-side spread below and the settings' sdNew and yearD (one knob for how much drivers differ)
  moveSd: 3, // true change of a driver's level at a team move, beyond the jump of the settings
  learn: [8, 4, 2], // points a driver gains in his 2nd, 3rd and 4th season (rookie learning)
  ageFrom: 11, // seasons after which a driver loses `ageLoss` points a season
  ageLoss: 2.5,
  upgrades: { rate: 0.2, meanRatio: 0.4, rwShare: 0.4 }, // development steps: probability per race and car; mean over rms size of a step; share of raceC^2 that stays a random walk (the steps carry the rest, so the total in-season variance is the settings')
  sdInt: { race: 5, qual: 1.8 }, // driver-car fit (points), persistent while he stays with the car
  rhoInt: 0.6, // winter persistence of that fit
  numberOne: { race: 1.5, qual: 3 }, // points for the team's stronger driver, minus for the other (resources, priority)
  wetSkillSd: 8, // race: a driver's persistent wet-weather skill (points)
  wetSpread: 0.85, // race: how much of the level spread shows up in the wet
  // ---- race
  secPerPoint: { race: 1 / 30, qual: 1 / 55 },
  lapBase: 90, // seconds
  sigmaLap: 0.28, // seconds, lap-to-lap noise
  sigmaStint: 0.333, // seconds per lap, stint-level offset (tyres, traffic, set-up)
  fuelRate: 0.035, // seconds a lap lighter per lap burned
  degRate: 0.05, // seconds per lap of tyre age
  trafficProb: 0.05,
  formSd: { race: 15, qual: 56 }, // points: a driver's form on the weekend (health, set-up, confidence), fresh every weekend, so a teammate gap is not read off the past alone
  luckDriver: 2, // seconds of race time (strategy, safety-car timing, traffic at the start), own
  luckTeamRatio: 0.7, // ... shared by a team's two cars, as a fraction of the own
  luckWetMult: 1,
  wetStintMult: 1.875, // pace-offset noise in the wet
  mechRate: { 2000: 0.28, 2002: 0.32, 2004: 0.19, 2007: 0.16, 2008: 0.1, 2010: 0.14, 2011: 0.11, 2015: 0.07 }, // mechanical retirements per start (interpolated)
  incRate: { 2000: 0.14, 2005: 0.09, 2008: 0.12, 2011: 0.065, 2015: 0.06 }, // driver incidents per start (interpolated)
  relCarSd: 0.5, // log-sd of a car's reliability
  relPaceCorr: 0.5, // slower cars are less reliable (correlation of the car's reliability effect with its pace when it first appears)
  incSkillCorr: 0.5, // weaker drivers have more incidents (same, for drivers)
  relRegBoost: 1.4,
  incDriverSd: 0.5,
  incRookie: 1.4,
  incWet: 1.6,
  // laps completed when a car stops, from the real retirements of 2002-2011: weights of the buckets 0 | 1-2 | 3-5 | 6-11 | 12-24 | 25-39 | 40-59 | 60+
  // laps (the last four scaled to the race length, so that a short race has no impossible bucket)
  failBuckets: {
    mech: [54, 20, 16, 69, 128, 155, 188, 47],
    inc: [107, 35, 7, 29, 57, 73, 63, 14],
  },
  gridNoise: 18, // points: how far the grid (qualifying) is from the order of race pace; the grid decides the early order
  gridGap: 0.4, // seconds a slot costs on lap 1
  retirePenalty: [4, 40], // seconds lost on the lap a car stops (it slows before it stops), so a retiree is behind at his last lap ...
  retirePenaltyProb: 0.15, // ... in this share of retirements (the others stop at speed)
  damageProb: 0.7, // a car that is about to retire first runs damaged or failing for its last 1-4 laps ...
  damageSec: [1, 6], // ... losing this many seconds a lap
  lapGapProb: 0.02, // the lap file of a driver-race is incomplete (3 or 4 laps kept): the exam then falls back to global medians (source 'pace')
  offsetRho: 0.93, // lap-to-lap persistence of the pace offset that is not a stint effect (traffic, tyre state, track)
  // ---- qualifying
  sigmaQual: 0.022, // seconds, per segment
};

const interp = (table, year) => {
  const ys = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  if (year <= ys[0]) return table[ys[0]];
  if (year >= ys.at(-1)) return table[ys.at(-1)];
  for (let k = 1; k < ys.length; k++)
    if (year <= ys[k]) return table[ys[k - 1]] + ((table[ys[k]] - table[ys[k - 1]]) * (year - ys[k - 1])) / (ys[k] - ys[k - 1]);
  return table[ys.at(-1)];
};

/**
 * The latent dynamics of a v2 world, per session, fixed (not read from the shipped settings, so that the same world is a fair test of any
 * settings, now or after the shipped ones change). They are the shipped settings of the baseline for the process noise, with the spreads
 * (`sdC`, `sdNew`, `yearD`) the calibration against the real data chose (research/eval, docs/evaluation.md "Simulator v2"): the truth is
 * not the filter's prior.
 */
export const WORLD_V2_DYNAMICS = {
  race: {
    s: 75,
    sdNew: 10,
    yearD: 3,
    sdC: 50,
    rho: 0.8,
    winterC: 11.379153390987709,
    raceC: 0.9103322712790167,
    raceD: 0,
    sdJ: 5,
    sdA: 5,
    rhoA: 0.8,
    dipR: 0,
    sdR: 0,
    rhoR: 0.85,
  },
  qual: {
    s: 75,
    sdNew: 33.8,
    yearD: 8.45,
    sdC: 67.5,
    rho: 1,
    winterC: 32.5,
    raceC: 5.7122,
    raceD: 0,
    sdJ: 30,
    sdA: 0,
    rhoA: 0.8,
    dipR: 45,
    sdR: 6.5536,
    rhoR: 0.85,
  },
};

/**
 * The parameters of a v2 world. By default the fixed dynamics above; `own` = { race?: hyper, qual?: hyper } draws the dynamics of a session
 * from the settings of the filter under test instead (the `--null-self` of the harness), and `world` overrides any parameter.
 */
export function worldParamsV2(worldFromHyper, own = {}, world = {}) {
  const dyn = (s) => ({ ...WORLD_V2_DYNAMICS[s], ...(own[s] ? worldFromHyper(own[s]) : {}) });
  return { ...WORLD_V2_DEFAULTS, race: dyn('race'), qual: dyn('qual'), ...world, version: 2 };
}

const fmtTime = (sec) => {
  const ms = Math.round(sec * 1000);
  const m = Math.floor(ms / 60000);
  const s = (ms - m * 60000) / 1000;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
};

const CAP = ELO_EXAM.cap;
const ALPHA = ELO_EXAM.alpha;
const margin = (g) => Math.min(CAP, 1 + ALPHA * Math.log2(Math.max(1, g)));

const EDGES = [0, 1, 3, 6, 0.2, 0.42, 0.67, 1];
/** Laps completed by a car that stops, drawn from the bucket weights (edges in laps up to 12, then fractions of the race length). */
function lapsCompleted(weights, L, r) {
  const tot = weights.reduce((a, b) => a + b, 0);
  let u = r.next() * tot;
  let b = 0;
  while (b < weights.length - 1 && u >= weights[b]) u -= weights[b++];
  const edge = (k) => (EDGES[k] < 1 && k >= 4 ? EDGES[k] * L : EDGES[k]);
  const lo = edge(b);
  const hi = b === weights.length - 1 ? L - 1 : edge(b + 1);
  return Math.max(0, Math.min(L - 1, Math.floor(lo + r.next() * Math.max(0, hi - lo))));
}

/** One simulated race: results, lap times and snapshots, then the exam's own observations. */
function simulateRace({ w, parts, p, r, state, covered, wetFlag, year }) {
  const L = Math.max(40, Math.min(78, Math.round((wetFlag ? 52 : 58) + 7 * r.normal())));
  const T0 = p.lapBase + 8 * r.normal();
  const wetMult = wetFlag ? 1 : 0;
  const spread = wetFlag ? p.wetSpread : 1;
  const sec = p.secPerPoint.race;
  const mech = interp(p.mechRate, year);
  const inc = interp(p.incRate, year);
  const teamLuck = new Map();
  const drivers = parts.map((d) => {
    const a = d.level.race; // D + A of the driver
    const base =
      spread * (a + state.C.race.get(d.car)) + state.I.race.get(`${d.id}|${d.car}`) + state.N1.get(`${d.id}|${d.car}`) * p.numberOne.race;
    const wet = wetMult * (state.W.get(d.id) ?? 0);
    const stops = r.next() < 0.5 ? 1 : r.next() < 0.8 ? 2 : 3;
    const pitLaps = Array.from({ length: stops }, (_, k) => Math.round(((k + 1) * L) / (stops + 1) + 4 * r.normal())).sort((x, y) => x - y);
    if (!teamLuck.has(d.car)) teamLuck.set(d.car, p.luckTeamRatio * p.luckDriver * (wetFlag ? p.luckWetMult : 1) * r.normal());
    const luck = teamLuck.get(d.car) + p.luckDriver * (wetFlag ? p.luckWetMult : 1) * r.normal();
    // failures: car reliability and driver incidents, each at a lap (0 laps completed = lap-1 retirement)
    const relF = Math.exp(state.REL.get(d.car) - 0.5 * p.relCarSd ** 2) * (state.regRel ? p.relRegBoost : 1);
    const incF = Math.exp(state.INC.get(d.id) - 0.5 * p.incDriverSd ** 2) * (d.rookie ? p.incRookie : 1) * (wetFlag ? p.incWet : 1);
    let failLap = Infinity;
    let cause = null;
    if (r.next() < Math.min(0.9, mech * relF)) {
      failLap = 1 + lapsCompleted(p.failBuckets.mech, L, r);
      cause = 'Engine';
    }
    if (r.next() < Math.min(0.9, inc * incF)) {
      const lap = 1 + lapsCompleted(p.failBuckets.inc, L, r);
      if (lap < failLap) {
        failLap = lap;
        cause = r.next() < 0.5 ? 'Collision' : r.next() < 0.5 ? 'Accident' : 'Spun off';
      }
    }
    return {
      ...d,
      base: base + wet + p.formSd.race * r.normal(),
      stops,
      pitLaps,
      luck,
      failLap,
      cause,
      deg: p.degRate * Math.exp(0.3 * r.normal()),
    };
  });

  // the grid: race pace plus qualifying noise; a slot costs time on lap 1, so the early order follows the grid and the order of pace takes over
  const gridOrder = [...drivers].sort((a, b) => b.base + p.gridNoise * r.normal() - (a.base + p.gridNoise * r.normal()));
  gridOrder.forEach((d, k) => (d.slot = k));

  // lap times and cumulative race time
  const csv = [];
  const rid = w.raceId;
  for (const d of drivers) {
    let t = 0;
    let stintStart = 1;
    const sStint = p.sigmaStint * (wetFlag ? p.wetStintMult : 1);
    let stintOff = sStint * Math.sqrt(0.5) * r.normal();
    let wander = sStint * Math.sqrt(0.5) * r.normal();
    const cum = [];
    const lapRows = [];
    const nLaps = Math.min(L, d.failLap - 1);
    const damaged = d.failLap <= L && r.next() < p.damageProb;
    const dmgFrom = damaged ? nLaps - Math.floor(4 * r.next()) : Infinity;
    const dmgSec = p.damageSec[0] + (p.damageSec[1] - p.damageSec[0]) * r.next();
    for (let l = 1; l <= nLaps; l++) {
      wander = p.offsetRho * wander + Math.sqrt(1 - p.offsetRho ** 2) * sStint * Math.sqrt(0.5) * r.normal();
      let lap = T0 - sec * d.base + p.fuelRate * (L - l) + d.deg * (l - stintStart) + stintOff + wander + p.sigmaLap * r.normal();
      if (l === 1) lap += 4 + 2 * r.next() + p.gridGap * d.slot;
      if (r.next() < p.trafficProb) lap += 0.3 + 1.2 * r.next();
      if (d.pitLaps.includes(l)) {
        lap += 21;
        stintStart = l + 1;
        stintOff = sStint * Math.sqrt(0.5) * r.normal();
      }
      if (l >= dmgFrom) lap += dmgSec;
      if (l === nLaps && d.failLap <= L && r.next() < p.retirePenaltyProb)
        lap += p.retirePenalty[0] + (p.retirePenalty[1] - p.retirePenalty[0]) * r.next();
      t += lap;
      cum.push(t);
      lapRows.push([l, lap]);
    }
    // lap records the exam sees: complete, or (rarely) a few laps only
    let kept = lapRows.filter(([l]) => l >= 2);
    if (r.next() < p.lapGapProb && kept.length > 4) {
      const k = 3 + Math.floor(2 * r.next());
      const pick = new Set();
      while (pick.size < k) pick.add(Math.floor(r.next() * kept.length));
      kept = kept.filter((_, j) => pick.has(j));
    }
    for (const [l, lap] of kept) csv.push(`${rid},${d.id},${l},${Math.round(lap * 1000)}`);
    d.cum = cum;
    d.laps = cum.length;
    d.total = (cum.at(-1) ?? 0) + d.luck + 0; // strategy luck applies to the finish, not to the lap times
    d.retired = d.failLap <= L;
  }
  const finishers = drivers.filter((d) => !d.retired).sort((a, b) => a.total - b.total);
  const winner = finishers[0];
  const lapAvg = winner ? winner.total / L : T0;
  for (const d of finishers) {
    const behind = Math.min(4, Math.max(0, Math.floor((d.total - winner.total) / lapAvg)));
    d.laps = L - behind;
    d.statusName = behind ? `+${behind} Lap${behind > 1 ? 's' : ''}` : 'Finished';
  }
  const retirees = drivers.filter((d) => d.retired).sort((a, b) => b.laps - a.laps || b.total - a.total);
  for (const d of retirees) d.statusName = d.cause;
  const ordered = [...finishers, ...retirees];
  ordered.forEach((d, k) => (d.positionOrder = k + 1));
  const rows = ordered.map((d) => ({
    driverId: d.id,
    constructorId: d.cid,
    statusName: d.statusName,
    positionOrder: d.positionOrder,
    laps: d.laps,
  }));

  // lap pace (the exam's own parser) and the order after each retirement lap (the exam's snapshots)
  let lapPace = null;
  const lapSnapshots = new Map();
  if (covered) {
    lapPace = parseLapPace(`raceId,driverId,lap,milliseconds\n${csv.join('\n')}`);
    for (const d of retirees) {
      const lap = d.laps;
      if (!(lap > 0) || lapSnapshots.has(`${rid}|${lap}`)) continue;
      const at = ordered.filter((o) => o.cum.length >= lap).sort((a, b) => a.cum[lap - 1] - b.cum[lap - 1]);
      lapSnapshots.set(`${rid}|${lap}`, new Map(at.map((o, k) => [o.id, k + 1])));
    }
  }
  const built = buildRaceObservations({
    rid,
    rows,
    maxLaps: Math.max(1, winner ? L : Math.max(...rows.map((x) => x.laps), 1)),
    lapPace,
    lapSnapshots,
    orderW: ELO_EXAM.orderW,
    paceW: ELO_EXAM.paceW,
    beta: ELO_EXAM.partialExp,
  });
  return built.observations.map((ob) => {
    const same = ob.x.constructorId === ob.y.constructorId;
    const gw = (ob.gapSec != null ? Math.min(CAP, 1 + ALPHA * Math.log2(1 + ob.gapSec / 0.3)) : margin(ob.gap)) * ob.base;
    return {
      x: ob.x.driverId,
      y: ob.y.driverId,
      cx: ob.x.constructorId,
      cy: ob.y.constructorId,
      o: ob.obs,
      w: gw * (same ? ELO_EXAM.tmBoost : 1),
      same,
      src: ob.source,
    };
  });
}

/** One simulated qualifying session and the exam's observations from its times. */
function simulateQual({ parts, p, r, state, year }) {
  const sec = p.secPerPoint.qual;
  const T0 = p.lapBase - 3 + 3 * r.normal();
  const q = parts.map((d) => {
    const base =
      state.C.qual.get(d.car) + d.level.qual + state.I.qual.get(`${d.id}|${d.car}`) + state.N1.get(`${d.id}|${d.car}`) * p.numberOne.qual;
    return { ...d, speed: T0 - sec * (base + p.formSd.qual * r.normal()) };
  });
  const seg = (list, sd, drop = 0) => list.map((d) => ({ d, t: d.speed - drop + sd * r.normal() }));
  const n = q.length;
  const q1 = seg(q, p.sigmaQual).sort((a, b) => a.t - b.t);
  const adv1 = year >= 2006 ? Math.min(n, n >= 24 ? 17 : 16) : n;
  const adv2 = year >= 2006 ? Math.min(n, 10) : n;
  const in2 =
    year >= 2006
      ? seg(
          q1.slice(0, adv1).map((x) => x.d),
          p.sigmaQual,
          0.3,
        ).sort((a, b) => a.t - b.t)
      : [];
  const in3 =
    year >= 2006
      ? seg(
          in2.slice(0, adv2).map((x) => x.d),
          p.sigmaQual,
          0.5,
        ).sort((a, b) => a.t - b.t)
      : [];
  const t1 = new Map(q1.map((x) => [x.d.id, x.t]));
  const t2 = new Map(in2.map((x) => [x.d.id, x.t]));
  const t3 = new Map(in3.map((x) => [x.d.id, x.t]));
  const order = [...in3.map((x) => x.d), ...in2.slice(adv2).map((x) => x.d), ...q1.slice(year >= 2006 ? adv1 : 0).map((x) => x.d)];
  const qrows = order.map((d, k) => ({
    driverId: d.id,
    constructorId: d.cid,
    position: k + 1,
    q1: t1.has(d.id) ? fmtTime(t1.get(d.id)) : '',
    q2: t2.has(d.id) ? fmtTime(t2.get(d.id)) : '',
    q3: t3.has(d.id) ? fmtTime(t3.get(d.id)) : '',
  }));
  return buildQualObservations(qrows).map((ob) => {
    const same = ob.x.constructorId === ob.y.constructorId;
    const gw = Math.min(CAP, 1 + ALPHA * Math.log2(1 + ob.dt / 0.25));
    return {
      x: ob.x.driverId,
      y: ob.y.driverId,
      cx: ob.x.constructorId,
      cy: ob.y.constructorId,
      o: ob.obs,
      w: gw * (same ? ELO_EXAM.qTmBoost : 1),
      same,
      src: 'qual',
    };
  });
}

/**
 * A v2 world on the real calendar.
 * @param {object[]} timeline  real weekends
 * @param {object} idx         indexTimeline(timeline, ...)
 * @param {'race'|'qual'} session  the session whose observations are replaced (the other one keeps the real ones)
 * @param {object} params      WORLD_V2_DEFAULTS plus `race` and `qual`, the per-session dynamics (see worldParamsV2)
 * @param {number} seed
 * @returns {{ timeline: object[], truth: { drivers: Map[], cars: Map[] } }}   as syntheticWorld
 */
export function syntheticWorldV2(timeline, idx, session, params = {}, seed = 1) {
  const p = { ...WORLD_V2_DEFAULTS, ...params };
  for (const s of SESSIONS) p[s] = { ...(params[s] ?? {}) };
  const ds = p.driverScale;
  if (ds !== 1) {
    for (const s of SESSIONS) {
      p[s].sdNew *= ds;
      p[s].yearD *= ds;
      p.sdInt = { ...p.sdInt, [s]: p.sdInt[s] * ds };
      p.numberOne = { ...p.numberOne, [s]: p.numberOne[s] * ds };
    }
    p.moveSd *= ds;
    p.learn = p.learn.map((x) => x * ds);
    p.ageLoss *= ds;
  }
  const rL = rng(seed >>> 0);
  const rRace = rng((seed * 7919 + 17) >>> 0);
  const rQual = rng((seed * 104729 + 31) >>> 0);
  const rc = (rho, z) => rho * z + Math.sqrt(1 - rho * rho) * rL.normal();
  const state = {
    D: { race: new Map(), qual: new Map() },
    C: { race: new Map(), qual: new Map() },
    A: { race: new Map(), qual: new Map() },
    decay: { race: new Map(), qual: new Map() },
    I: { race: new Map(), qual: new Map() },
    N1: new Map(), // number-one indicator in [-1, 1] per driver-car
    W: new Map(),
    REL: new Map(),
    INC: new Map(),
    regRel: false,
  };
  const seasons = new Map(); // driver -> seasons seen so far, the current one included (experience)
  const debut = new Map();
  const lastTeam = new Map();
  const lastSeenYear = new Map();
  const outTimeline = [];
  const truth = { drivers: [], cars: [] };
  let prevYear = null;
  for (const w of timeline) {
    const year = w.year;
    if (prevYear !== null && year !== prevYear) {
      state.regRel = (p.regYears ?? [2009, 2014, 2017, 2022, 2026]).includes(year);
      for (const [car] of state.C.race) {
        const z = rL.normal();
        const zq = rc(p.rCar, z);
        const reg = state.regRel ? (p.regMult ?? 1) : 1;
        state.C.race.set(car, p.race.rho * state.C.race.get(car) + p.race.winterC * reg * z);
        state.C.qual.set(car, p.qual.rho * state.C.qual.get(car) + p.qual.winterC * reg * zq);
        state.REL.set(car, 0.6 * state.REL.get(car) + Math.sqrt(1 - 0.36) * p.relCarSd * rL.normal());
      }
      for (const [d] of state.D.race) {
        const z = rL.normal();
        const zq = rc(p.rDrv, z);
        const n = seasons.get(d) ?? 0;
        const active = lastSeenYear.get(d) === prevYear;
        const drift = !active ? 0 : n >= 1 && n <= p.learn.length ? p.learn[n - 1] : n >= p.ageFrom ? -p.ageLoss * (n - p.ageFrom + 1) : 0;
        state.D.race.set(d, state.D.race.get(d) + p.race.yearD * z + drift);
        state.D.qual.set(d, state.D.qual.get(d) + p.qual.yearD * zq + drift);
        state.W.set(d, state.W.get(d) * 0.9 + p.wetSkillSd * 0.44 * rL.normal());
      }
      for (const key of state.I.race.keys()) {
        for (const s of SESSIONS)
          state.I[s].set(key, p.rhoInt * state.I[s].get(key) + Math.sqrt(1 - p.rhoInt ** 2) * p.sdInt[s] * rL.normal());
      }
    } else if (prevYear !== null) {
      const { rate, meanRatio, rwShare } = p.upgrades;
      const rw = Math.sqrt(rwShare);
      const spread = Math.sqrt(1 - meanRatio ** 2);
      for (const [car] of state.C.race) {
        const up = rL.next() < rate;
        const zStep = rL.normal();
        const zStepQ = rc(p.rCar, zStep);
        const z = rL.normal();
        const zq = rc(p.rCar, z);
        // steps of rms size a, so that rate * a^2 is the share of the settings' per-weekend variance the random walk gave up
        const a = (raceC) => Math.sqrt(((1 - rwShare) * raceC ** 2) / rate);
        state.C.race.set(car, state.C.race.get(car) + p.race.raceC * rw * z + (up ? a(p.race.raceC) * (meanRatio + spread * zStep) : 0));
        state.C.qual.set(car, state.C.qual.get(car) + p.qual.raceC * rw * zq + (up ? a(p.qual.raceC) * (meanRatio + spread * zStepQ) : 0));
      }
    }
    prevYear = year;
    for (const s of SESSIONS) for (const [k, v] of state.A[s]) state.A[s].set(k, v * state.decay[s].get(k));
    // participants of this weekend: everyone with a row (their car and team), plus their new states
    const carOfRow = new Map();
    const teamOfRow = new Map();
    for (const row of w.rows) {
      const d = String(row.driverId);
      const cid = String(row.constructorId);
      const car = idx.carOf(cid);
      carOfRow.set(d, car);
      teamOfRow.set(d, { car, cid });
      if (!state.C.race.has(car)) {
        const z = rL.normal();
        state.C.race.set(car, p.race.sdC * z);
        state.C.qual.set(car, p.qual.sdC * rc(p.rCar, z));
        state.REL.set(car, p.relCarSd * (-p.relPaceCorr * z + Math.sqrt(1 - p.relPaceCorr ** 2) * rL.normal()));
      }
      const team = idx.canon(cid);
      if (!state.D.race.has(d)) {
        const z = rL.normal();
        state.D.race.set(d, p.race.sdNew * z);
        state.D.qual.set(d, p.qual.sdNew * rc(p.rDrv, z));
        state.W.set(d, p.wetSkillSd * rL.normal());
        state.INC.set(d, p.incDriverSd * (-p.incSkillCorr * z + Math.sqrt(1 - p.incSkillCorr ** 2) * rL.normal()));
        seasons.set(d, year === idx.firstYear ? 1 + Math.floor(rL.next() * 9) : 0); // veterans of the first season have an unknown past
        debut.set(d, year);
        for (const s of SESSIONS) {
          if (year > idx.firstYear && p[s].sdR > 0) {
            state.A[s].set(d, -p[s].dipR + p[s].sdR * rL.normal());
            state.decay[s].set(d, p[s].rhoR);
          }
        }
      } else if (lastTeam.get(d) !== team) {
        const z = rL.normal();
        for (const s of SESSIONS) {
          const zz = s === 'race' ? z : rc(p.rDrv, z);
          state.D[s].set(d, state.D[s].get(d) + Math.hypot(p[s].sdJ ?? 0, p.moveSd) * zz);
          if (p[s].sdA > 0) {
            state.A[s].set(d, p[s].sdA * rL.normal());
            state.decay[s].set(d, p[s].rhoA);
          }
        }
      }
      for (const s of SESSIONS) if (!state.I[s].has(`${d}|${car}`)) state.I[s].set(`${d}|${car}`, p.sdInt[s] * rL.normal());
      if (lastSeenYear.get(d) !== year) {
        seasons.set(d, (seasons.get(d) ?? 0) + 1);
        lastSeenYear.set(d, year);
      }
      lastTeam.set(d, team);
    }
    // number-one effect: +1 for the team's stronger driver, -1 for the weaker, by race level (two-car teams)
    const byCar = new Map();
    for (const [d, car] of carOfRow) byCar.set(car, [...(byCar.get(car) ?? []), d]);
    for (const [car, ds] of byCar) {
      if (ds.length === 2) {
        const [a, b] = ds;
        const diff = state.D.race.get(a) + (state.A.race.get(a) ?? 0) - state.D.race.get(b) - (state.A.race.get(b) ?? 0);
        const v = Math.tanh(diff / 15);
        state.N1.set(`${a}|${car}`, v);
        state.N1.set(`${b}|${car}`, -v);
      } else for (const d of ds) state.N1.set(`${d}|${car}`, 0);
    }
    const level = (s, d) => state.D[s].get(d) + (state.A[s].get(d) ?? 0);

    // the requested session's observations
    let obs = w.obs[session];
    if (session === 'race') {
      const ids = [...new Set(w.obs.race.flatMap((o) => [o.x, o.y]))];
      if (ids.length >= 2) {
        const parts = ids.map((id) => {
          const d = String(id);
          const t =
            teamOfRow.get(d) ?? w.obs.race.map((o) => (o.x === id ? { cid: o.cx } : o.y === id ? { cid: o.cy } : null)).find(Boolean);
          const car = teamOfRow.get(d)?.car ?? idx.carOf(String(t.cid));
          const cid = teamOfRow.get(d)?.cid ?? String(t.cid);
          return {
            id: d,
            cid,
            car,
            rookie: debut.get(d) === year && year > idx.firstYear,
            level: { race: level('race', d), qual: level('qual', d) },
          };
        });
        const covered = w.obs.race.some((o) => o.src === 'paceW' || o.src === 'pace' || o.src === 'partial');
        obs = simulateRace({ w, parts, p, r: rRace, state, covered, wetFlag: !!w.wet, year });
      }
    } else if (session === 'qual') {
      const ids = [...new Set(w.obs.qual.flatMap((o) => [o.x, o.y]))];
      if (ids.length >= 2) {
        const parts = ids.map((id) => {
          const d = String(id);
          const t =
            teamOfRow.get(d) ?? w.obs.qual.map((o) => (o.x === id ? { cid: o.cx } : o.y === id ? { cid: o.cy } : null)).find(Boolean);
          const car = teamOfRow.get(d)?.car ?? idx.carOf(String(t.cid));
          const cid = teamOfRow.get(d)?.cid ?? String(t.cid);
          return { id: d, cid, car, level: { race: level('race', d), qual: level('qual', d) } };
        });
        obs = simulateQual({ parts, p, r: rQual, state, year });
      }
    }
    outTimeline.push({ ...w, obs: { ...w.obs, [session]: obs } });

    // truth for the requested session: levels centred like the filter's ratings (drivers over the weekend's drivers, cars over its distinct cars)
    const dIds = [...carOfRow.keys()];
    const cKeys = [...new Set(carOfRow.values())];
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    const mD = mean(dIds.map((d) => level(session, d)));
    const mC = mean(cKeys.map((c) => state.C[session].get(c)));
    truth.drivers.push(new Map(dIds.map((d) => [d, level(session, d) - mD])));
    truth.cars.push(new Map([...idx.carCid[w.i]].map(([car, cid]) => [cid, state.C[session].get(car) - mC])));
    for (const row of w.rows) {
      const cid = String(row.constructorId);
      if (!truth.cars[truth.cars.length - 1].has(cid))
        truth.cars[truth.cars.length - 1].set(cid, state.C[session].get(idx.carOf(cid)) - mC);
    }
  }
  return { timeline: outTimeline, truth };
}
