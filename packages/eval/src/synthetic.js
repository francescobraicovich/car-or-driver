// Worlds with known answers, on the real schedule.
//
// Keep the real calendar: who raced for which team at every weekend, which drivers moved and when, the renames and
// takeovers, and the exact pair structure of the observations (who is compared with whom, the weights, the sources).
// Replace what is not known: draw true driver and car levels from a generative model, draw one performance per driver
// per weekend (true level plus Gumbel noise, so every pair follows the Bradley-Terry odds the filter assumes, or heavy
// tailed noise to test robustness) and derive each observation from the ranking. One draw per driver and weekend is what
// keeps the pairs dependent in the right way; independent coin flips per pair would be far too informative.
//
// Two uses:
//   truth      recovery of drivers and cars, error-bar coverage, and leakage measured against the true values;
//   null       every real-data diagnostic computed on a world where the filter's assumptions hold is what a correct model
//              would score on it. Zero is not that value for most of them (selection of movers, and the posterior
//              correlation between a driver and his car), so each real number is reported next to its synthetic one.
import { rng, clusterBootstrap, mean, ols, rms, sd } from './stats.js';
import { carPost, driverPost } from './events.js';
import { shockRecords } from './shocks.js';
import { syntheticWorldV2 } from './synthetic-v2.js';

export const WORLD_DEFAULTS = {
  s: 75, // rating points per factor ten in the odds (the filter's likelihood scale)
  sdNew: 20, // true driver level at his first appearance
  yearD: 4, // yearly drift of a driver
  raceD: 0,
  sdC: 35, // true car level at its first appearance
  rho: 0.8, // winter persistence of a car
  winterC: 25, // winter innovation of a car in a normal year
  regMult: 1, // ... times this in a regulation year
  raceC: 2, // per-weekend drift of a car (development)
  moveSd: 0, // true change of a driver's level when he moves team (beyond the jump below)
  // the filter's own transient mechanics (zero = none): a jump of the level and a fading adjustment at a team change, and a
  // fading debut adjustment for a rookie (negative mean: rookies start slower than they settle)
  sdJ: 0,
  sdA: 0,
  rhoA: 0.8,
  dipR: 0,
  sdR: 0,
  rhoR: 0.85,
  regYears: [2009, 2014, 2017, 2022, 2026],
  noise: 'gumbel', // or 't3': heavy-tailed performance noise with the same spread
};

/**
 * The world the filter under test assumes: its own prior and drift settings, Gumbel noise. On such a world a correct
 * filter is correctly specified, so what the diagnostics show there is what they should show on the real data. A
 * stress world overrides some of these (bigger regulation winters, heavy tails, true changes at a move).
 */
export function worldFromHyper(h) {
  return {
    s: h.s,
    sdNew: h.sdNew,
    yearD: h.yearD,
    raceD: h.raceD,
    sdC: h.sdC,
    rho: h.rho,
    winterC: h.winterC,
    raceC: h.raceC,
    sdJ: h.sdJ,
    sdA: h.sdA,
    rhoA: h.rhoA,
    dipR: h.dipR,
    sdR: h.sdR,
    rhoR: h.rhoR,
  };
}

/**
 * @param {object[]} timeline  real weekends
 * @param {object} idx         indexTimeline(timeline, ...)
 * @param {'race'|'qual'} session  the session whose observations are replaced
 * @returns {{ timeline: object[], truth: { drivers: Map[], cars: Map[] } }}
 *   truth.drivers[i] / truth.cars[i]: true levels at weekend i (a driver's level includes his transient adjustment), centred
 *   on that weekend's field as the filter's are
 */
export function syntheticWorld(timeline, idx, session, params = {}, seed = 1) {
  if (params.version === 2) return syntheticWorldV2(timeline, idx, session, params, seed); // opt-in, see synthetic-v2.js
  const p = { ...WORLD_DEFAULTS, ...params };
  const r = rng(seed);
  const beta = p.s / Math.LN10;
  const noise = p.noise === 't3' ? () => ((beta * 1.2825) / Math.sqrt(3)) * r.t(3) : () => beta * r.gumbel();
  const D = new Map();
  const C = new Map();
  const A = new Map(); // transient adjustments (new team, debut) and their per-weekend persistence
  const decay = new Map();
  const lastTeam = new Map();
  let prevYear = null;
  const outTimeline = [];
  const truth = { drivers: [], cars: [] };
  for (const w of timeline) {
    if (prevYear !== null && w.year !== prevYear) {
      const sdW = p.winterC * (p.regYears.includes(w.year) ? p.regMult : 1);
      for (const [k, v] of C) C.set(k, p.rho * v + sdW * r.normal());
      for (const [k, v] of D) D.set(k, v + p.yearD * r.normal());
    } else if (prevYear !== null) {
      for (const [k, v] of C) C.set(k, v + p.raceC * r.normal());
      if (p.raceD > 0) for (const [k, v] of D) D.set(k, v + p.raceD * r.normal());
    }
    prevYear = w.year;
    for (const [k, v] of A) A.set(k, v * decay.get(k));
    const carOfRow = new Map();
    for (const row of w.rows) {
      const d = String(row.driverId);
      const car = idx.carOf(String(row.constructorId));
      carOfRow.set(d, car);
      if (!C.has(car)) C.set(car, p.sdC * r.normal());
      const team = idx.canon(String(row.constructorId));
      if (!D.has(d)) {
        D.set(d, p.sdNew * r.normal());
        if (idx.year(w.i) > idx.firstYear && p.sdR > 0) {
          A.set(d, -p.dipR + p.sdR * r.normal());
          decay.set(d, p.rhoR);
        }
      } else if (lastTeam.get(d) !== team) {
        D.set(d, D.get(d) + Math.hypot(p.sdJ, p.moveSd) * r.normal());
        if (p.sdA > 0) {
          A.set(d, p.sdA * r.normal());
          decay.set(d, p.rhoA);
        }
      }
      lastTeam.set(d, team);
    }
    const perf = new Map();
    const level = (d) => D.get(d) + (A.get(d) ?? 0);
    for (const [d, car] of carOfRow) perf.set(d, level(d) + C.get(car) + noise());
    const obs = w.obs[session].map((ob) => ({ ...ob, o: perf.get(ob.x) > perf.get(ob.y) ? 1 : 0 }));
    outTimeline.push({ ...w, obs: { ...w.obs, [session]: obs } });
    // truth centred like the filter's ratings: drivers over the weekend's drivers, cars over its distinct cars
    const dIds = [...carOfRow.keys()];
    const cKeys = [...new Set(carOfRow.values())];
    const mD = mean(dIds.map(level));
    const mC = mean(cKeys.map((c) => C.get(c)));
    truth.drivers.push(new Map(dIds.map((d) => [d, level(d) - mD])));
    truth.cars.push(new Map([...idx.carCid[w.i]].map(([car, cid]) => [cid, C.get(car) - mC])));
    // a constructor id listed twice in a weekend (two ids, one car) gets the same true level
    for (const row of w.rows) {
      const cid = String(row.constructorId);
      if (!truth.cars[truth.cars.length - 1].has(cid)) truth.cars[truth.cars.length - 1].set(cid, C.get(idx.carOf(cid)) - mC);
    }
  }
  return { timeline: outTimeline, truth };
}

const z90 = 1.645;

/** How well a rating run recovered the truth of a synthetic world. */
export function truthMetrics(idx, run, world, { boot = {}, moves = [] } = {}) {
  const { truth } = world;
  const pre = `truth.${run.session}`;
  const H = {};
  const out = { headline: H };
  const errD = [];
  const errC = [];
  const zD = [];
  const zC = [];
  idx.timeline.forEach((w, i) => {
    if (w.year < idx.firstYear + 2) return; // let the first seasons settle
    for (const [d, r] of run.post[i].drivers) {
      if (r.seen === false || !truth.drivers[i].has(d)) continue;
      const e = r.m - truth.drivers[i].get(d);
      errD.push({ year: w.year, e });
      if (Number.isFinite(r.sd) && r.sd > 0) zD.push({ year: w.year, z: e / r.sd });
    }
    for (const [cid, r] of run.post[i].cars) {
      if (!truth.cars[i].has(cid)) continue;
      const e = r.m - truth.cars[i].get(cid);
      errC.push({ year: w.year, e });
      if (Number.isFinite(r.sd) && r.sd > 0) zC.push({ year: w.year, z: e / r.sd });
    }
  });
  const rmse = (xs) => Math.sqrt(mean(xs.map((x) => x.e ** 2)));
  out.rmseDriver = clusterBootstrap(errD, (x) => x.year, rmse, boot);
  out.rmseCar = clusterBootstrap(errC, (x) => x.year, rmse, boot);
  H[`${pre}.rmseDriver`] = out.rmseDriver;
  H[`${pre}.rmseCar`] = out.rmseCar;
  if (zD.length) {
    out.coverage = {};
    for (const [name, zs] of [
      ['driver', zD],
      ['car', zC],
    ]) {
      out.coverage[name] = {
        z2: clusterBootstrap(
          zs,
          (x) => x.year,
          (xs) => mean(xs.map((x) => x.z ** 2)),
          boot,
        ),
        cover90: clusterBootstrap(
          zs,
          (x) => x.year,
          (xs) => mean(xs.map((x) => +(Math.abs(x.z) < z90))),
          boot,
        ),
      };
      H[`${pre}.z2.${name}`] = out.coverage[name].z2;
      H[`${pre}.cover90.${name}`] = out.coverage[name].cover90;
    }
  }

  // forecast error of the gap of a pair, from the levels before the weekend: teammates and different cars
  const gapErr = { mates: [], cars: [] };
  idx.timeline.forEach((w, i) => {
    if (w.year < idx.firstYear + 2) return;
    const pr = run.pre[i];
    for (const ob of w.obs[run.session]) {
      const dx = pr.drivers.get(ob.x);
      const dy = pr.drivers.get(ob.y);
      const cx = pr.cars.get(ob.cx);
      const cy = pr.cars.get(ob.cy);
      const tx = truth.drivers[i].get(ob.x);
      const ty = truth.drivers[i].get(ob.y);
      const ux = truth.cars[i].get(ob.cx);
      const uy = truth.cars[i].get(ob.cy);
      if (![dx, dy, cx, cy, tx, ty, ux, uy].every(Number.isFinite)) continue;
      const est = dx - dy + (cx - cy);
      const tru = tx - ty + (ux - uy);
      (ob.same ? gapErr.mates : gapErr.cars).push({ year: w.year, e: est - tru });
    }
  });
  out.gapRmse = {
    mates: clusterBootstrap(gapErr.mates, (x) => x.year, rmse, boot),
    cars: clusterBootstrap(gapErr.cars, (x) => x.year, rmse, boot),
  };
  H[`${pre}.gapRmse.mates`] = out.gapRmse.mates;
  H[`${pre}.gapRmse.cars`] = out.gapRmse.cars;

  // leakage against the true car swing: the estimated change of a driver's rating over a winter / a window on the TRUE
  // change of his car (true driver and car changes are independent by construction, so the slope is the leak)
  const recs = shockRecords(idx, run).filter((x) => x.sameCar);
  const withTruth = recs
    .map((x) => {
      const cid0 = idx.cidAt[x.i0].get(x.driverId);
      const cid1 = idx.cidAt[x.i1].get(x.driverId);
      return {
        year: x.year,
        kind: x.kind,
        unchanged: x.unchanged,
        estDD: driverPost(run, x.i1, x.driverId) - driverPost(run, x.i0, x.driverId),
        trueDC: truth.cars[x.i1].get(cid1) - truth.cars[x.i0].get(cid0),
        estDC: carPost(run, x.i1, cid1) - carPost(run, x.i0, cid0),
        trueDD: truth.drivers[x.i1].get(x.driverId) - truth.drivers[x.i0].get(x.driverId),
      };
    })
    .filter((x) => [x.estDD, x.trueDC, x.estDC, x.trueDD].every(Number.isFinite));
  const slope = (key) => (xs) =>
    ols(
      xs.map((x) => x[key]),
      xs.map((x) => x.estDD),
    ).b;
  out.leakTruth = {};
  for (const [name, sel] of [
    ['winterUnchanged', (x) => x.kind === 'winter' && x.unchanged],
    ['winterJoined', (x) => x.kind === 'winter' && !x.unchanged],
    ['season', (x) => x.kind === 'season'],
  ]) {
    const items = withTruth.filter(sel);
    out.leakTruth[name] = clusterBootstrap(items, (x) => x.year, slope('trueDC'), boot);
    H[`${pre}.leakTruth.${name}`] = out.leakTruth[name];
  }
  // how much of the TRUE car swing the car estimate captured (1 = all): the other side of the same split
  out.carCapture = clusterBootstrap(
    withTruth.filter((x) => x.kind === 'winter'),
    (x) => x.year,
    (xs) =>
      ols(
        xs.map((x) => x.trueDC),
        xs.map((x) => x.estDC),
      ).b,
    boot,
  );
  H[`${pre}.carCapture`] = out.carCapture;

  // movers: the estimated change of rating over the first five races on the new team against the true change
  const stepErr = [];
  for (const ev of moves.filter((m) => m.valid && m.stint >= 5)) {
    const t5 = ev.apps[4].i;
    const a = driverPost(run, ev.ell, ev.driverId);
    const b = driverPost(run, t5, ev.driverId);
    const ta = truth.drivers[ev.ell].get(ev.driverId);
    const tb = truth.drivers[t5].get(ev.driverId);
    if ([a, b, ta, tb].every(Number.isFinite)) stepErr.push({ year: ev.year, e: b - a - (tb - ta) });
  }
  out.moverStepError = {
    mean: clusterBootstrap(
      stepErr,
      (x) => x.year,
      (xs) => mean(xs.map((x) => x.e)),
      boot,
    ),
    rms: rms(stepErr.map((x) => x.e)),
    sd: sd(stepErr.map((x) => x.e)),
    n: stepErr.length,
  };
  H[`${pre}.moverStepBias`] = out.moverStepError.mean;
  return out;
}

/**
 * A small league for tests and examples: `teams` teams of two drivers, a few seasons, drivers who change team or retire
 * (replaced by rookies) each winter, and every pair of a weekend observed (exam-like weights; outcomes to be filled by
 * syntheticWorld). Identity is the constructor id itself: no renames, no takeovers.
 */
export function toyTimeline({ seasons = 8, races = 12, teams = 6, seed = 1, startYear = 2000 } = {}) {
  const r = rng(seed);
  let nextDriver = 1;
  const lineup = Array.from({ length: teams }, () => [String(nextDriver++), String(nextDriver++)]);
  const timeline = [];
  for (let s = 0; s < seasons; s++) {
    if (s > 0) {
      // winter: one swap between two teams most years, one retirement replaced by a rookie some years
      if (r.next() < 0.8) {
        const a = Math.floor(r.next() * teams);
        const b = (a + 1 + Math.floor(r.next() * (teams - 1))) % teams;
        const ia = Math.floor(r.next() * 2);
        const ib = Math.floor(r.next() * 2);
        [lineup[a][ia], lineup[b][ib]] = [lineup[b][ib], lineup[a][ia]];
      }
      if (r.next() < 0.6) lineup[Math.floor(r.next() * teams)][Math.floor(r.next() * 2)] = String(nextDriver++);
    }
    for (let k = 0; k < races; k++) {
      const rows = lineup.flatMap((pair, t) => pair.map((d) => ({ driverId: d, constructorId: String(t + 1) })));
      const obs = [];
      for (let i = 0; i < rows.length; i++)
        for (let j = i + 1; j < rows.length; j++) {
          const same = rows[i].constructorId === rows[j].constructorId;
          obs.push({
            x: rows[i].driverId,
            y: rows[j].driverId,
            cx: rows[i].constructorId,
            cy: rows[j].constructorId,
            o: 1,
            w: (same ? 8 : 1) * 12,
            same,
            src: 'finish',
          });
        }
      const i = timeline.length;
      timeline.push({
        i,
        year: startYear + s,
        round: k + 1,
        date: `${startYear + s}-01-${String(k + 1).padStart(2, '0')}`,
        raceId: String(i),
        wet: false,
        rows,
        obs: { race: obs, qual: [] },
      });
    }
  }
  return timeline;
}
