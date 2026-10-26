// The exam of the state-space model: one walk over the weekends in date order that collects, for every weekend, what the filters
// and the forecast layer read, and the skeleton of the snapshot that finishStateSpace (state-space/build.js) completes with the ratings.
//
// Nothing here depends on a rating. A weekend carries
//   - its entrants and the exam's observations (race and qualifying), each with the weight it counts (exam.js),
//   - the hazards knowable before it (hazard.js) and the number of races each driver had started,
//   - what the forecast layer's replay needs (state-space/replay.js): the raw result and qualifying rows and the observation stream.
// The snapshot skeleton carries the entrants' names and hazard fields, the retirement audit and the exam part of the diagnostics.
import { MODEL_SETTINGS } from '../presets/model-settings.js';
import { lookupMapping } from '../status.js';
import { buildQualObservations, qualifyingTreatment } from '../qualifying.js';
import { buildRaceObservations } from '../observations.js';
import { auditWeekend } from '../report.js';
import { prepareWeekends } from '../weekends.js';
import { qualWeight, raceWeight } from '../exam.js';
import { carHazard, createHazards, driverHazard } from '../hazard.js';

/**
 * @param cache  caller-owned object reused across passes over the SAME data: the prepared weekends and the race observations are stored
 *               in it, so another pass over the exam (the Elo benchmark's) does not build them again.
 * @returns { model, weekends, cache }  model: the skeleton (names, snapshots, counters, params); weekends[i] matches model.snaps[i].
 */
export function collectExam(raw, lapSnapshots, maps, _params, lapPace = null, cache = {}) {
  if (!lapPace?.size) throw Error('The ratings need lap_times.csv. Load lap data first.');
  const S = MODEL_SETTINGS;
  const EXAM = { alpha: S.alpha, cap: S.cap, tmBoost: S.tmBoost, qTmBoost: S.qTmBoost };
  const prep = (cache.prep ??= prepareWeekends(raw));
  const { dname, cname, weekends: prepared, wetSet } = prep;
  const mapFor = (id) => lookupMapping(maps, id);
  // Race observations depend only on these settings (the exam keys), so they are built once per cache.
  const obsKey = `${S.orderW}|${S.paceW}|${S.partialExp}`;
  const obsCache = (cache.observations ??= new Map()).get(obsKey) ?? cache.observations.set(obsKey, new Map()).get(obsKey);

  const hazards = createHazards(S);
  const raceSeen = new Map();
  const weekends = [];
  const snaps = [];
  let prevYear = null;
  let recoveredSnapshots = 0;
  let totalRetirements = 0;
  let qualWeekends = 0;

  for (const weekend of prepared) {
    const { rid, info, rows, qrows, maxLaps } = weekend;
    if (rows.length < 2) continue;
    hazards.enter(rows);
    if (prevYear !== null && info.year !== prevYear) hazards.winter();
    prevYear = info.year;
    const preQ = hazards.before(rows);

    const cur = {
      info,
      year: info.year,
      rows: rows.map((r) => ({ driverId: String(r.driverId), constructorId: String(r.constructorId) })),
      raceObs: [],
      qualObs: [],
      // what the forecast layer's replay needs (see replay.js)
      rawRows: rows,
      qrows,
      raceSeen: new Map(raceSeen),
      preQ,
      replayObs: [],
    };
    weekends.push(cur);
    const observe = (ob, session, weight) => {
      const qual = session === 'qual';
      cur.replayObs.push({ ob, session, weight });
      (qual ? cur.qualObs : cur.raceObs).push({
        x: String(ob.x.driverId),
        y: String(ob.y.driverId),
        cx: String(ob.x.constructorId),
        cy: String(ob.y.constructorId),
        o: ob.obs,
        w: weight,
        same: ob.x.constructorId === ob.y.constructorId,
        src: qual ? 'qual' : ob.source,
      });
    };

    // --- Qualifying: the latest session in which both set a time, every pair
    let qDiag = { obsCount: 0, disruptions: 0 };
    if (qrows.length >= 2) {
      qualWeekends++;
      const qobs = (weekend.qobs ??= buildQualObservations(qrows));
      let weight = 0;
      for (const ob of qobs) {
        const { wd } = qualWeight(ob, EXAM);
        observe(ob, 'qual', wd);
        weight += wd;
      }
      qDiag = {
        obsCount: qobs.length,
        disruptions: qrows.filter((q) => qualifyingTreatment(q, info.year, qrows).disrupted).length,
        weight,
      };
    }

    // --- Race: finishes, lap pace and last-lap snapshots for retirements
    let built = obsCache.get(rid);
    if (!built) {
      built = buildRaceObservations({
        rid,
        rows,
        maxLaps,
        lapPace,
        lapSnapshots,
        orderW: S.orderW,
        paceW: S.paceW,
        beta: S.partialExp,
      });
      obsCache.set(rid, built);
    }
    const { observations, retirements, recovered } = built;
    totalRetirements += retirements;
    recoveredSnapshots += recovered;
    let obsCount = 0;
    let partialObs = 0;
    let carObs = 0;
    let weight = 0;
    for (const ob of observations) {
      const { wd } = raceWeight(ob, EXAM);
      observe(ob, 'race', wd);
      obsCount++;
      if (ob.source === 'partial') partialObs++;
      if (ob.x.constructorId !== ob.y.constructorId) carObs++;
      weight += wd;
    }

    // --- Hazards after the race, then the entrants' hazard rows
    const { mechEventWeight, driverEventWeight } = hazards.record(rows, mapFor);
    const activeD = new Set(rows.map((r) => r.driverId));
    const activeC = new Set(rows.map((r) => r.constructorId));
    for (const id of activeD) raceSeen.set(id, (raceSeen.get(id) || 0) + 1);
    const { qRelField, qIncField } = hazards.fieldRates();
    const cars = [...activeC].map((cid) => ({
      constructorId: cid,
      name: cname.get(cid) || cid,
      ...carHazard(hazards.stat(hazards.rel, cid), qRelField, S),
    }));
    const drivers = [...activeD].map((id) => {
      const rr = rows.find((r) => r.driverId === id);
      return {
        driverId: id,
        name: dname.get(id) || id,
        ...driverHazard(hazards.stat(hazards.inc, id), qIncField, S),
        constructorId: rr?.constructorId || '',
        car: cname.get(rr?.constructorId) || rr?.constructorId || '',
      };
    });

    const diag = {
      obsCount,
      partialObs,
      carObs,
      weight,
      preWeight: weight,
      wet: wetSet.has(rid),
      circuitId: info.circuitId || '',
      qRelField,
      qIncField,
      mechEventWeight,
      driverEventWeight,
      maxLaps,
      q: qDiag,
    };
    const { audit, qualAudit } = auditWeekend({ rid, rows, qrows, year: info.year, lapSnapshots, mapFor, dname, cname });
    snaps.push({ ...info, drivers, cars, audit, qualAudit, diag });
  }

  const model = {
    dname,
    cname,
    snaps,
    recoveredSnapshots,
    totalRetirements,
    qualWeekends,
    circuitList: prep.circuitList,
    params: { ...MODEL_SETTINGS, modelKind: 'state-space' },
  };
  return { model, weekends, cache };
}
