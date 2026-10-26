// Pairwise race observations for one weekend: who beat whom, and how much the
// comparison should count. Independent of the ratings, so it depends only on
// the data and on the observation-defining parameters (the "exam").
import { clamp } from './math.js';
import { defaultClass, isFinishStatusName } from './status.js';
import { compareWindows } from './lap-pace.js';

/** Identify short mechanical retirements whose recorded laps describe the fault. */
export function compromisedRacePaceIds(rows, maxLaps, paceMap) {
  const ids = new Set();
  if (!paceMap) return ids;
  for (const row of rows) {
    if (defaultClass(row.statusName).mech < 0.55 || +row.laps > maxLaps / 4) continue;
    const own = paceMap.get(row.driverId);
    const mate = rows.find(
      (other) => other.driverId !== row.driverId && other.constructorId === row.constructorId && isFinishStatusName(other.statusName),
    );
    const reference = mate && paceMap.get(mate.driverId);
    if (!own || !reference || own.n < 3 || reference.n < 3) continue;
    const shared = compareWindows(own.win, reference.win);
    if (shared?.faster === -1 && shared.gapSec > 0.04 * reference.med) ids.add(row.driverId);
  }
  return ids;
}

/**
 * @param {object} args
 * @param {string} args.rid       race id
 * @param {object[]} args.rows    result rows sorted by finishing order
 * @param {number} args.maxLaps   laps completed by the winner (>= 1)
 * @param {number} args.orderW    weight of finishing-order pairs
 * @param {number} args.paceW     weight of lap-pace pairs
 * @param {number} args.beta      retirement partial-weight exponent
 * @returns {{ observations: object[], retirements: number, recovered: number }}
 *   `retirements` and `recovered` count only when the finish-order/snapshot
 *   branch runs, exactly as the counters have always been reported.
 */
export function buildRaceObservations({ rid, rows, maxLaps, lapPace, lapSnapshots, orderW, paceW, beta }) {
  // A one-lap classification can be a safety-car parade rather than a race
  // (2021 Belgium, race 1063). Positions then repeat the grid, not race pace.
  // See formula1.com/en/latest/article/verstappen-takes-victory-in-severely-shortened-rain-affected-belgian-gp-as.4AqGhiKQfFaqr7KZjyDjPZ
  if (maxLaps < 2) return { observations: [], retirements: 0, recovered: 0 };
  const rowByDriver = new Map(rows.map((r) => [r.driverId, r]));
  const observations = [];
  let retirements = 0;
  let recovered = 0;

  // Representative lap pace for everyone with enough laps (incl. DNFs).
  // Classified finishers ALSO contribute order pairs (racecraft), weighted
  // by orderW; snapshots fill retirements lacking lap coverage. No double
  // counting: retirees with pace rely on pace alone.
  let usedPace = false;
  let paceMap = null;
  const compromisedPace = compromisedRacePaceIds(rows, maxLaps, lapPace?.get(rid));
  if (lapPace) {
    const pm = lapPace.get(rid);
    if (pm) {
      const quick = rows.filter((r) => !compromisedPace.has(r.driverId) && (pm.get(r.driverId)?.n ?? 0) >= 3);
      if (quick.length >= 2) {
        usedPace = true;
        paceMap = pm;
        for (let i = 0; i < quick.length; i++) {
          for (let j = i + 1; j < quick.length; j++) {
            const x = quick[i];
            const y = quick[j];
            const ex = pm.get(x.driverId);
            const ey = pm.get(y.driverId);
            // Compare only laps from overlapping race windows. A short early
            // stint may consist entirely of safety-car or wet laps while a
            // finisher's representative laps come much later; whole-race
            // medians then measure conditions rather than relative pace.
            const cw = compareWindows(ex.win, ey.win);
            if (!cw) continue;
            const cov = clamp(cw.laps / 16, 0.25, 1);
            observations.push({ x, y, obs: cw.faster > 0 ? 1 : 0, gapSec: cw.gapSec, base: cov * paceW, source: 'paceW' });
          }
        }
      }
    }
  }

  if (!usedPace || orderW > 0) {
    const finishers = rows.filter((r) => isFinishStatusName(r.statusName));
    for (let i = 0; i < finishers.length; i++) {
      for (let j = i + 1; j < finishers.length; j++) {
        const x = finishers[i];
        const y = finishers[j];
        const px = +x.positionOrder;
        const py = +y.positionOrder;
        if (Number.isFinite(px) && Number.isFinite(py) && px !== py) {
          observations.push({ x, y, obs: px < py ? 1 : 0, gap: Math.abs(px - py), base: orderW, source: 'finish' });
        }
      }
    }
    const seenPartial = new Set();
    for (const r of rows) {
      if (isFinishStatusName(r.statusName)) continue;
      retirements++;
      if (compromisedPace.has(r.driverId)) continue;
      // Retirees with lap coverage already learned from pace: skip snapshots.
      if (usedPace && (paceMap.get(r.driverId)?.n ?? 0) >= 3) continue;
      const lap = +r.laps;
      if (!(lap > 0)) continue;
      const sm = lapSnapshots.get(`${rid}|${lap}`);
      if (!sm) continue;
      const pi = sm.get(r.driverId);
      if (!Number.isFinite(pi)) continue;
      recovered++;
      const expo = Math.pow(clamp(lap / maxLaps, 0, 1), beta);
      for (const [oid, pj] of sm) {
        if (oid === r.driverId || compromisedPace.has(String(oid)) || !Number.isFinite(pj) || pi === pj) continue;
        const o = rowByDriver.get(String(oid));
        if (!o) continue;
        const a = r.driverId < o.driverId ? r.driverId : o.driverId;
        const b = r.driverId < o.driverId ? o.driverId : r.driverId;
        const key = `${lap}|${a}|${b}`;
        if (seenPartial.has(key)) continue;
        seenPartial.add(key);
        observations.push({ x: r, y: o, obs: pi < pj ? 1 : 0, gap: Math.abs(pi - pj), base: expo, source: 'partial' });
      }
    }
  }
  return { observations, retirements, recovered };
}
