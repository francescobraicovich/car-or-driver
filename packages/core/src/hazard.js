// DNF hazards: the head-to-head probability with per-lap retirement risk, and the decayed success/failure statistics
// (a success is a lap run, a failure a retirement) that the reliability and incident hazards are posteriors of.
import { clamp, pToRating } from './math.js';

/**
 * Head-to-head win probability with per-lap DNF hazards over L laps.
 *
 * A retires on lap m with probability a^(m-1)·qA (a = 1-qA); it then wins if B
 * already retired earlier, or on the same lap half the time. Summed over m this
 * is a geometric series, so the per-lap loop collapses to a closed form:
 *   Σ = (1 - a^L) - qA·(1 - ½qB)·(1 - (ab)^L)/(1 - ab)
 * This was a per-lap loop until it was found to be half of a backtest's runtime;
 * the closed form agrees with it to ~1e-14.
 */
export function headToHeadWithHazard(pPace, qA, qB, L) {
  qA = clamp(qA, 1e-9, 0.2);
  qB = clamp(qB, 1e-9, 0.2);
  L = Math.max(1, Math.round(L));
  const a = 1 - qA;
  const b = 1 - qB;
  const sA = a ** L;
  const sB = b ** L;
  const bothSurvive = (1 - sA * sB) / (1 - a * b);
  const p = sA * sB * pPace + sA * (1 - sB) + (1 - sA) - qA * (1 - 0.5 * qB) * bothSurvive;
  return clamp(p, 1e-6, 1 - 1e-6);
}

export function postHaz(st, qField, prior) {
  return (st.f + qField * prior) / (st.s + st.f + prior);
}

export function fieldHaz(st, baseQ = 0.0015, prior = 1500) {
  return (st.f + baseQ * prior) / (st.s + st.f + prior);
}

export function decayFactor(h) {
  return 0.5 ** (1 / Math.max(1, h));
}

export function decayStatsMap(m, f) {
  for (const v of m.values()) {
    v.s *= f;
    v.f *= f;
  }
}

const statOf = (m, id) => {
  if (!m.has(id)) m.set(id, { s: 0, f: 0 });
  return m.get(id);
};

/**
 * The reliability (per constructor) and incident (per driver) hazard statistics of a build, walked forward weekend by weekend:
 * laps run and retirements, decayed by their half-lives, damped each winter, read as a posterior against the field's rate.
 * Nothing here depends on a rating.
 */
export function createHazards({ relHalf, relPrior, relWinter, incHalf, incPrior }) {
  const rel = new Map();
  const inc = new Map();
  const fieldRel = { s: 0, f: 0 };
  const fieldInc = { s: 0, f: 0 };
  const relDecay = decayFactor(relHalf);
  const incDecay = decayFactor(incHalf);
  return {
    rel,
    inc,
    fieldRel,
    fieldInc,
    stat: statOf,
    /** Every entrant of the weekend has a statistic. */
    enter(rows) {
      for (const r of rows) {
        statOf(rel, r.constructorId);
        statOf(inc, r.driverId);
      }
    },
    /** A continuing team inherits its predecessor's reliability statistic. */
    inherit(from, to) {
      if (rel.has(from)) rel.set(to, { ...rel.get(from) });
    },
    /** Reliability is damped across a winter (rule changes, development); incidents are not. */
    winter() {
      for (const st of rel.values()) {
        st.s *= relWinter;
        st.f *= relWinter;
      }
    },
    /** Decay to this weekend, then the hazards knowable before it: { rel: constructor -> q, inc: driver -> q }. */
    before(rows) {
      decayStatsMap(rel, relDecay);
      decayStatsMap(inc, incDecay);
      fieldRel.s *= relDecay;
      fieldRel.f *= relDecay;
      fieldInc.s *= incDecay;
      fieldInc.f *= incDecay;
      const fr = fieldHaz(fieldRel, 0.0018, 1800);
      const fi = fieldHaz(fieldInc, 0.001, 1800);
      const preQ = { rel: new Map(), inc: new Map() };
      for (const r of rows) {
        if (!preQ.rel.has(r.constructorId)) preQ.rel.set(r.constructorId, postHaz(statOf(rel, r.constructorId), fr, relPrior));
        if (!preQ.inc.has(r.driverId)) preQ.inc.set(r.driverId, postHaz(statOf(inc, r.driverId), fi, incPrior));
      }
      return preQ;
    },
    /** After the race: laps run and retirements of each entrant, split mechanical / driver by the status mapping. */
    record(rows, mapFor) {
      let mechEventWeight = 0;
      let driverEventWeight = 0;
      for (const r of rows) {
        const m = mapFor(String(r.statusId));
        const laps = Math.max(0, +r.laps || 0);
        const rs = statOf(rel, r.constructorId);
        const is = statOf(inc, r.driverId);
        rs.s += laps;
        rs.f += m.mech;
        fieldRel.s += laps;
        fieldRel.f += m.mech;
        is.s += laps;
        is.f += m.driver;
        fieldInc.s += laps;
        fieldInc.f += m.driver;
        mechEventWeight += m.mech;
        driverEventWeight += m.driver;
      }
      return { mechEventWeight, driverEventWeight };
    },
    /** The field rates after the weekend, as shown next to the ranked rows. */
    fieldRates: () => ({ qRelField: fieldHaz(fieldRel, 0.0018, 1800), qIncField: fieldHaz(fieldInc, 0.001, 1800) }),
  };
}

/** A constructor's hazard fields: per-lap failure rate, survival over the standard distance, and its worth as a rating. */
export function carHazard(stat, field, { relPrior, stdLaps, scale }) {
  const q = postHaz(stat, field, relPrior);
  return { q, survival: (1 - q) ** stdLaps, reliabilityElo: pToRating(headToHeadWithHazard(0.5, q, field, stdLaps), scale) };
}

/** A driver's hazard fields: per-lap incident rate, chance of a clean race over the standard distance, and its worth as a rating. */
export function driverHazard(stat, field, { incPrior, stdLaps, scale }) {
  const q = postHaz(stat, field, incPrior);
  return { q, clean: (1 - q) ** stdLaps, incidentElo: pToRating(headToHeadWithHazard(0.5, q, field, stdLaps), scale) };
}
