// Read-only views of the model state after a weekend: the ranked driver/car
// rows shown in tables and charts, the retirement audit, and the export rows.
// None of this feeds back into the ratings.
import { BASE, combineRating, gapToP, pToRating } from './math.js';
import { carHazard, driverHazard, fieldHaz, headToHeadWithHazard } from './hazard.js';
import { isFinishStatusName } from './status.js';
import { qualifyingTreatment } from './qualifying.js';

const statFor = (m, id) => {
  if (!m.has(id)) m.set(id, { s: 0, f: 0 });
  return m.get(id);
};

/**
 * Ratings + hazards + package pace for every entrant of the weekend, ranked by
 * effective rating.
 * @param {object} s  model state (rating maps, hazard stats, seen counters, names)
 * @param {object} p  params: { relPrior, incPrior, stdLaps, qualWeight, qualOn, scale }
 */
export function rankWeekend(s, p) {
  const { activeC, activeD, rows, C, D, QC, QD, qcSeen, qdSeen, rel, inc, fieldRel, fieldInc, cname, dname } = s;
  const eP = (d) => gapToP(d, p.scale);
  const eFP = (x) => pToRating(x, p.scale);
  const LSTD = p.stdLaps;

  const qRelField = fieldHaz(fieldRel, 0.0018, 1800);
  const qIncField = fieldHaz(fieldInc, 0.001, 1800);
  const carRows = [...activeC]
    .map((cid) => {
      const { q, survival, reliabilityElo } = carHazard(statFor(rel, cid), qRelField, p);
      const race = C.get(cid);
      const qual = QC.get(cid) ?? BASE;
      const combined = combineRating(race, qual, qcSeen.get(cid) || 0, p.qualWeight, p.qualOn);
      const effective = eFP(headToHeadWithHazard(eP(combined - BASE), q, qRelField, LSTD));
      return { constructorId: cid, name: cname.get(cid) || cid, race, qual, combined, q, survival, reliabilityElo, effective };
    })
    .sort((a, b) => b.effective - a.effective);

  const carMap = new Map(carRows.map((c) => [c.constructorId, c]));
  const driverRows = [...activeD]
    .map((id) => {
      const { q, clean, incidentElo } = driverHazard(statFor(inc, id), qIncField, p);
      const race = D.get(id);
      const qual = QD.get(id) ?? BASE;
      const combined = combineRating(race, qual, qdSeen.get(id) || 0, p.qualWeight, p.qualOn);
      const effective = eFP(headToHeadWithHazard(eP(combined - BASE), q, qIncField, LSTD));
      const rr = rows.find((r) => r.driverId === id);
      const car = carMap.get(rr?.constructorId);
      const packagePace = car ? BASE + (combined - BASE) + (car.combined - BASE) : combined;
      const qPkg = car ? 1 - (1 - q) * (1 - car.q) : q;
      const qFieldPkg = 1 - (1 - qIncField) * (1 - qRelField);
      const packageEffective = eFP(headToHeadWithHazard(eP(packagePace - BASE), qPkg, qFieldPkg, LSTD));
      return {
        driverId: id,
        name: dname.get(id) || id,
        race,
        qual,
        combined,
        q,
        clean,
        incidentElo,
        effective,
        constructorId: rr?.constructorId || '',
        car: cname.get(rr?.constructorId) || rr?.constructorId || '',
        packagePace,
        packageEffective,
      };
    })
    .sort((a, b) => b.effective - a.effective);

  return { carRows, driverRows, carMap, qRelField, qIncField };
}

/** How each result row and each qualifying row was treated by the model. */
export function auditWeekend({ rid, rows, qrows, year, lapSnapshots, mapFor, dname, cname }) {
  const audit = rows.map((r) => {
    const m = mapFor(String(r.statusId));
    const hasSnap = !isFinishStatusName(r.statusName) && +r.laps > 0 && lapSnapshots.has(`${rid}|${+r.laps}`);
    return {
      pos: r.positionOrder,
      driver: dname.get(r.driverId) || r.driverId,
      car: cname.get(r.constructorId) || r.constructorId,
      status: r.statusName,
      laps: +r.laps || 0,
      mech: m.mech,
      driverRisk: m.driver,
      treatment: isFinishStatusName(r.statusName) ? 'final order' : hasSnap ? 'last-lap snapshot' : 'pace censored',
    };
  });
  const qualAudit = qrows.map((q) => {
    const t = qualifyingTreatment(q, year);
    return {
      pos: q.position,
      driver: dname.get(q.driverId) || q.driverId,
      car: cname.get(q.constructorId) || q.constructorId,
      q1: q.q1,
      q2: q.q2,
      q3: q.q3,
      deep: t.deep,
      treatment: t.treatment,
    };
  });
  return { audit, qualAudit };
}

/** One CSV-ready row per driver of the weekend. */
export function exportRowsFor(info, driverRows, carMap) {
  return driverRows.map((d) => {
    const c = carMap.get(d.constructorId);
    return {
      ...info,
      driver: d.name,
      constructor: d.car,
      driverRace: d.race,
      driverQual: d.qual,
      driverCombined: d.combined,
      driverEffective: d.effective,
      driverClean: d.clean,
      driverIncidentElo: d.incidentElo,
      carRace: c?.race ?? NaN,
      carQual: c?.qual ?? NaN,
      carCombined: c?.combined ?? NaN,
      carSurvival: c?.survival ?? NaN,
      carReliabilityElo: c?.reliabilityElo ?? NaN,
      carEffective: c?.effective ?? NaN,
      packagePace: d.packagePace,
      packageEffective: d.packageEffective,
    };
  });
}
