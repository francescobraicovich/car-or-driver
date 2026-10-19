// The catalogue of events the diagnostics are built on: moves, new teammates, rookies, winters, renames and takeovers.
//
// Events come from who raced where and from the published lineage of teams, never from the ratings: picking "car
// shocks" as the cases where the model's own car level jumped would be circular. The only model-dependent object
// here is `controls`, which measures how much stable entities (drivers and cars whose team did not change)
// moved over the same weekends, so that a change in a rating can be read net of grid turnover (ratings are
// centred on whoever raced that weekend, so a retiring star shifts everyone else's number).
import { mean, rms } from './stats.js';

/** Winters after which the cars were redesigned across the grid (a hand-kept list: published regulation changes). */
export const REGULATION_YEARS = [2009, 2014, 2017, 2022, 2026];

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Index of a timeline: who raced for which team and car at every weekend.
 * @param {object[]} timeline
 * @param {{ canon: (id: string) => string, carOf: (id: string) => string }} identity
 *        canon: lineage-aware team (did the driver move); carOf: car identity (a rename keeps the car, a takeover does not)
 */
export function indexTimeline(timeline, { canon, carOf }) {
  const n = timeline.length;
  const teamAt = [];
  const cidAt = [];
  const lineup = [];
  const carLineup = [];
  const carCid = [];
  const appear = new Map();
  const teamWeeks = new Map();
  const carWeeks = new Map();
  const tenure = [];
  const lastTeam = new Map();
  const run = new Map();
  for (const w of timeline) {
    const ta = new Map();
    const ca = new Map();
    const lu = new Map();
    const cl = new Map();
    const cc = new Map();
    const tn = new Map();
    for (const r of w.rows) {
      const d = String(r.driverId);
      const cid = String(r.constructorId);
      const team = canon(cid);
      const car = carOf(cid);
      ta.set(d, team);
      ca.set(d, cid);
      if (!lu.has(team)) lu.set(team, []);
      lu.get(team).push(d);
      if (!cl.has(car)) cl.set(car, []);
      cl.get(car).push(d);
      if (!cc.has(car)) cc.set(car, cid);
      if (!appear.has(d)) appear.set(d, []);
      appear.get(d).push({ i: w.i, team, cid, car });
      run.set(d, lastTeam.get(d) === team ? (run.get(d) || 0) + 1 : 1);
      lastTeam.set(d, team);
      tn.set(d, run.get(d));
    }
    for (const l of lu.values()) l.sort();
    for (const l of cl.values()) l.sort();
    for (const team of lu.keys()) {
      if (!teamWeeks.has(team)) teamWeeks.set(team, []);
      teamWeeks.get(team).push(w.i);
    }
    for (const car of cl.keys()) {
      if (!carWeeks.has(car)) carWeeks.set(car, []);
      carWeeks.get(car).push(w.i);
    }
    teamAt.push(ta);
    cidAt.push(ca);
    lineup.push(lu);
    carLineup.push(cl);
    carCid.push(cc);
    tenure.push(tn);
  }
  return {
    n,
    timeline,
    canon,
    carOf,
    teamAt,
    cidAt,
    lineup,
    carLineup,
    carCid,
    appear,
    teamWeeks,
    carWeeks,
    tenure,
    firstYear: n ? timeline[0].year : 0,
    year: (i) => timeline[i].year,
  };
}

/**
 * Drivers who changed team (lineage-aware) and had a past: the "movers" of the first property.
 * @param {object} idx
 * @param {{ minPrior?: number, maxGapYears?: number, minStint?: number }} [o]
 *   minPrior   appearances before the move for a driver to count as established, not a rookie (default 10)
 *   maxGapYears  longest absence before the move (default 1: longer breaks are returns, not moves)
 *   minStint   appearances for the new team for the event to count (default 3: stand-ins are not moves)
 */
export function findMoves(idx, { minPrior = 10, maxGapYears = 1, minStint = 3 } = {}) {
  const out = [];
  for (const [d, apps] of idx.appear) {
    for (let j = 1; j < apps.length; j++) {
      if (apps[j].team === apps[j - 1].team) continue;
      let stint = 0;
      while (j + stint < apps.length && apps[j + stint].team === apps[j].team) stint++;
      const ev = {
        driverId: d,
        ell: apps[j - 1].i,
        t0: apps[j].i,
        year: idx.year(apps[j].i),
        winter: idx.year(apps[j].i) !== idx.year(apps[j - 1].i),
        gapYears: idx.year(apps[j].i) - idx.year(apps[j - 1].i),
        nPrior: j,
        stint,
        from: apps[j - 1],
        to: apps[j],
        apps: apps.slice(j, j + stint),
      };
      ev.valid = j >= minPrior && ev.gapYears <= maxGapYears && stint >= minStint;
      out.push(ev);
    }
  }
  return out.sort((a, b) => a.t0 - b.t0 || a.driverId.localeCompare(b.driverId));
}

/**
 * Lineup changes of a team between two consecutive weekends it raced: who stayed, who came in, who left.
 * `valid` needs a stayer and only established incomers that stay a while: that is the setting of the second property.
 * @param {object} idx
 * @param {object[]} moves  findMoves(idx) (used to tell established incomers from rookies and stand-ins)
 */
export function findTeamChanges(idx, moves, { minStint = 3 } = {}) {
  const moveOf = new Map(moves.filter((m) => m.valid).map((m) => [`${m.driverId}|${m.t0}`, m]));
  const out = [];
  for (const [team, weeks] of idx.teamWeeks) {
    for (let a = 1; a < weeks.length; a++) {
      const lp = idx.lineup[weeks[a - 1]].get(team);
      const ln = idx.lineup[weeks[a]].get(team);
      if (sameList(lp, ln)) continue;
      const stayers = ln.filter((d) => lp.includes(d));
      const incoming = ln.filter((d) => !lp.includes(d));
      const outgoing = lp.filter((d) => !ln.includes(d));
      const movers = incoming.map((d) => moveOf.get(`${d}|${weeks[a]}`)).filter(Boolean);
      out.push({
        team,
        ellT: weeks[a - 1],
        t0: weeks[a],
        year: idx.year(weeks[a]),
        winter: idx.year(weeks[a]) !== idx.year(weeks[a - 1]),
        stayers,
        incoming,
        outgoing,
        movers,
        weeksAfter: weeks.slice(a),
        valid: stayers.length > 0 && incoming.length > 0 && movers.length === incoming.length && weeks.length - a >= minStint,
      });
    }
  }
  return out.sort((a, b) => a.t0 - b.t0 || a.team.localeCompare(b.team));
}

/** A driver's first appearance in the data after the first season (earlier drivers are not known to be rookies). */
export function findRookies(idx) {
  const out = [];
  for (const [d, apps] of idx.appear) {
    if (idx.year(apps[0].i) <= idx.firstYear) continue;
    out.push({ driverId: d, t0: apps[0].i, year: idx.year(apps[0].i), team: apps[0].team, cid: apps[0].cid, apps });
  }
  return out.sort((a, b) => a.t0 - b.t0);
}

/**
 * Grid-turnover controls for one rating run. For two weekends i0 < i1 they give the change in rating of every driver
 * (car) in a team whose lineup is identical at both weekends, so a mover's change can be read net of how the field's
 * centring moved. Memoised. Returns { n, mean, rms, loose } or null when there are too few stable entities.
 */
export function makeControls(idx, run) {
  const cache = new Map();
  const m = (i, kind, id) => run.post[i][kind].get(id)?.m;
  const finish = (deltas, loose) => {
    const mu = mean(deltas);
    return { n: deltas.length, mean: mu, loose, rms: rms(deltas.map((v) => v - mu)) };
  };
  // Entities of a team whose lineup is identical at both weekends; when fewer than four qualify (winters shuffle
  // many lineups), those that merely stayed in the same team.
  const collect = (i0, i1, kind) => {
    const groups = kind === 'drivers' ? [idx.lineup[i0], idx.lineup[i1]] : [idx.carLineup[i0], idx.carLineup[i1]];
    const level = (i, key, d) => (kind === 'drivers' ? m(i, 'drivers', d) : m(i, 'cars', idx.carCid[i].get(key)));
    const strict = [];
    const loose = [];
    for (const [key, l0] of groups[0]) {
      const l1 = groups[1].get(key);
      if (!l1) continue;
      const ents = kind === 'drivers' ? l0.filter((d) => l1.includes(d)) : [key];
      for (const e of ents) {
        const a = level(i0, key, e);
        const b = level(i1, key, e);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        loose.push(b - a);
        if (sameList(l0, l1)) strict.push(b - a);
      }
    }
    if (strict.length >= 4) return finish(strict, false);
    return loose.length >= 4 ? finish(loose, true) : null;
  };
  return {
    drivers(i0, i1) {
      const key = `d|${i0}|${i1}`;
      if (!cache.has(key)) cache.set(key, collect(i0, i1, 'drivers'));
      return cache.get(key);
    },
    cars(i0, i1) {
      const key = `c|${i0}|${i1}`;
      if (!cache.has(key)) cache.set(key, collect(i0, i1, 'cars'));
      return cache.get(key);
    },
  };
}

/** Rating of a driver after weekend i (NaN when the model has none, or has not seen him). */
export const driverPost = (run, i, d) => {
  const r = run.post[i].drivers.get(d);
  return r && r.seen !== false ? r.m : NaN;
};
/** Rating of a car (by constructor id) after weekend i. */
export const carPost = (run, i, cid) => run.post[i].cars.get(cid)?.m ?? NaN;
/** The constructor id under which car identity `car` raced at weekend i, if it did. */
export const carCidAt = (idx, i, car) => idx.carCid[i].get(car);
