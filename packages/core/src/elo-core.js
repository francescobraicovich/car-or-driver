// Elo-style rating core: chronological race + qualifying Elo with reliability
// hazards, circuit affinity and wet-weather skill.
//
// It is the Elo benchmark and also supplies the state-space model with the
// retirement hazards, circuit offsets and wet skill it still reads.
//
// buildEloCore() is pure (no DOM, no globals): it takes data + params and returns
// the model, so it can run on the main thread, in tests, or in a Web Worker.
import { BASE, clamp, gapToP } from './math.js';
import { createHazards, headToHeadWithHazard } from './hazard.js';
import { lookupMapping } from './status.js';
import { buildQualObservations, qualifyingTreatment } from './qualifying.js';
import { isHomeRace } from './geography.js';
import { buildRaceObservations } from './observations.js';
import { auditWeekend, exportRowsFor, rankWeekend } from './report.js';
import { qualWeight, raceWeight } from './exam.js';
import { gridVal, prepareWeekends } from './weekends.js';
import { CONSTRUCTOR_LINEAGE } from './lineage.js';
import { TUNED_ELO } from './presets/tuned-elo.js';

/** Re-center active ratings on BASE so the field mean stays at 1000. */
function centerMap(map, active) {
  const vals = [...active].map((id) => map.get(id)).filter(Number.isFinite);
  if (!vals.length) return;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sh = BASE - mean;
  for (const [id, v] of map) map.set(id, v + sh);
}

/**
 * The shipped settings, plus switches for the optional mechanisms below. Each switch's default is an exact no-op,
 * so the shipped settings reproduce their numbers unchanged.
 */
export const DEFAULT_PARAMS = {
  ...TUNED_ELO,
  // (tmLearn and qTmLearn, in the settings, are teammate LEARNING multipliers on top of tmBoost and qTmBoost.
  // tmBoost still sets how much a teammate pair counts when SCORING, which defines the exam and stays frozen;
  // these scale only how much it teaches the driver ratings. Constructor ratings never see same-team pairs.)
  // Rookie prior. A driver who debuts after the first season of data starts at
  // BASE + rookieStart + rookieAge * (age at debut - 22) instead of BASE (0, 0 is
  // an exact no-op). rookieTau > 0 replaces the rookieBoost-for-rookieN-races step
  // with a boost that fades smoothly, 1 + (rookieBoost - 1) / (1 + races / rookieTau),
  // the shape of a learning rate that follows a shrinking uncertainty (0 keeps the step).
  rookieStart: 0,
  rookieAge: 0,
  rookieTau: 0,
  // Car rating across the winter. 0 on all four is the original rule (shrink every car toward
  // the field average by carCarry/qCarCarry), an exact no-op.
  //   lineage     bit 1: a team that merely renamed (same owner and staff) inherits the old id's
  //               state (see lineage.js) instead of restarting at the field average. Bit 2:
  //               the same for ownership takeovers (3 = both). Takeovers cost accuracy in 2005
  //               and 2008-2010 (Honda to Brawn, Brawn to Mercedes), so only bit 1 is worth using.
  //   carMean     0..1: shrink toward the team's own long-run level instead of the field average.
  //   carLongRate how fast that long-run level follows the end-of-season rating.
  //   carTrend    0..1: carry this share of the rating change over the last 8 weekends of the
  //               season into the next one (a car that was developing keeps going).
  lineage: 0,
  carMean: 0,
  carLongRate: 0.3,
  carTrend: 0,
};

/**
 * Chronological walk-forward build.
 *
 * `options.lean` keeps only what a backtest score needs (per-weekend `diag`),
 * skipping the ranked rows, audit, export rows and histories — several times
 * cheaper, and bit-identical in every `diag` value.
 * `options.cache` is a caller-owned object reused across builds of the SAME
 * raw/lapSnapshots/lapPace; parameter-independent work is stored in it.
 */
export function buildEloCore(raw, lapSnapshots, maps, p, lapPace = null, hooks = null, options = {}) {
  const lean = !!options.lean;
  const cache = options.cache ?? {};
  const {
    kd: KD,
    kc: KC,
    tmBoost: TMB,
    alpha: A,
    cap: CAP,
    partialExp: BETA,
    carCarry: CARRY,
    qkd: QKD,
    qkc: QKC,
    qTmBoost: QTMB,
    qCarCarry: QCARRY,
    qualWeight: QW,
    qualOn: QON,
    relHalf: REL_HALF,
    relPrior: REL_PRIOR,
    relWinter: REL_WINTER,
    incHalf: INC_HALF,
    incPrior: INC_PRIOR,
    stdLaps: LSTD,
    circK: CIRCK,
    circCarry: CIRCCARRY,
    gridAdv: GRID_ADV,
    rookieBoost: ROOKIEB,
    rookieN: ROOKIEN,
    wetK: WETK,
    scale: SC,
    gridAdvRefuel: GRID_REF,
    homeAdv: HOME,
    hazardW: HAZW,
    orderW: ORDERW,
    paceW: PACEW,
    kcEarly: KC_EARLY,
    kcTau: KC_TAU,
    regCarry: REG_CARRY,
    tmLearn: TM_LEARN,
    qTmLearn: QTM_LEARN,
    rookieStart: ROOKIE_START,
    rookieAge: ROOKIE_AGE,
    rookieTau: ROOKIE_TAU,
    lineage: LINEAGE,
    carMean: CAR_MEAN,
    carLongRate: CAR_LONG_RATE,
    carTrend: CAR_TREND,
  } = { ...DEFAULT_PARAMS, ...p };
  // Scale-aware Elo (SC = 400 reproduces classic Elo exactly).
  const eP = (d) => gapToP(d, SC);
  const prep = (cache.prep ??= prepareWeekends(raw));
  const { dname, cname, weekends, seasonSize, dnat, cirCountry, wetSet } = prep;
  const mapFor = (id) => lookupMapping(maps, id);
  // Race observations depend only on these parameters (the exam keys), so
  // a search that keeps them fixed builds them once.
  const obsKey = `${ORDERW}|${PACEW}|${BETA}`;
  const obsCache = (cache.observations ??= new Map()).get(obsKey) ?? cache.observations.set(obsKey, new Map()).get(obsKey);

  const D = new Map();
  const C = new Map();
  const QD = new Map();
  const QC = new Map();
  const qdSeen = new Map();
  const qcSeen = new Map();
  const hazards = createHazards({ relHalf: REL_HALF, relPrior: REL_PRIOR, relWinter: REL_WINTER, incHalf: INC_HALF, incPrior: INC_PRIOR });
  const { rel, inc, fieldRel, fieldInc } = hazards;
  const dh = new Map();
  const ch = new Map();
  const snaps = [];
  const exportRows = [];
  // Latent state: driver circuit affinity, wet skill, weekends seen.
  const aff = new Map();
  const wet = new Map();
  const raceSeen = new Map();
  let prevYear = null;
  // Season progress drives the car learning rate. Counting weekends within the
  // season (not info.round) keeps this correct when a calendar skips a round,
  // and rescaling to a 20-race season makes kcTau mean the same thing in a
  // 17-race 2003 and a 24-race 2025. Calendars are published in advance, so
  // knowing a season's length is not hindsight.
  let seasonIndex = 0;
  let recoveredSnapshots = 0;
  let totalRetirements = 0;
  let qualWeekends = 0;

  const ensure = (m, id) => {
    if (!m.has(id)) m.set(id, BASE);
  };
  const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  const EXAM = { alpha: A, cap: CAP, tmBoost: TMB, qTmBoost: QTMB };
  // Seasons in which the technical regulations were substantially rewritten.
  // Announced years ahead, so this is prior knowledge, not hindsight.
  const REG_RESET_YEARS = new Set([2009, 2014, 2017, 2022, 2026]);

  // A driver first seen after the first season of data is a rookie; those in the first
  // season were already racing, so they get no rookie prior.
  const firstYear = weekends[0]?.info.year;
  const rookiePrior = ROOKIE_START !== 0 || ROOKIE_AGE !== 0;
  const startRating = (id, info) => {
    const born = prep.ddob?.get(String(id));
    const age = Number.isFinite(born) ? (Date.parse(info.date) - born) / (365.25 * 86400000) : 22;
    return BASE + ROOKIE_START + ROOKIE_AGE * (age - 22);
  };

  // Car-rating state for the winter rules: long-run level, and the last 9 ratings (trend).
  const carLong = new Map();
  const qcLong = new Map();
  const cHist = new Map();
  const qcHist = new Map();
  const transferred = new Set();
  const pushHist = (hist, cid, v) => {
    const h = hist.get(cid) ?? hist.set(cid, []).get(cid);
    h.push(v);
    if (h.length > 9) h.shift();
  };

  for (const weekend of weekends) {
    const { rid, info, rows, qrows, maxLaps } = weekend;
    if (rows.length < 2) continue;
    if (LINEAGE) {
      // A continuing team inherits its predecessor's state the first time its new id races.
      const present = new Set(rows.map((r) => r.constructorId));
      for (const t of CONSTRUCTOR_LINEAGE) {
        const key = `${t.from}>${t.to}@${t.year}`;
        if (!(LINEAGE & (t.kind === 'rename' ? 1 : 2)) || transferred.has(key) || info.year < t.year || !present.has(t.to)) continue;
        transferred.add(key);
        if (!C.has(t.from)) continue;
        C.set(t.to, C.get(t.from));
        if (QC.has(t.from)) QC.set(t.to, QC.get(t.from));
        if (qcSeen.has(t.from)) qcSeen.set(t.to, qcSeen.get(t.from));
        hazards.inherit(t.from, t.to);
        if (carLong.has(t.from)) carLong.set(t.to, carLong.get(t.from));
        if (qcLong.has(t.from)) qcLong.set(t.to, qcLong.get(t.from));
        if (cHist.has(t.from)) cHist.set(t.to, [...cHist.get(t.from)]);
        if (qcHist.has(t.from)) qcHist.set(t.to, [...qcHist.get(t.from)]);
      }
    }
    for (const r of rows) {
      if (rookiePrior && !D.has(r.driverId) && info.year > firstYear) {
        const start = startRating(r.driverId, info);
        D.set(r.driverId, start);
        QD.set(r.driverId, start);
      }
      ensure(D, r.driverId);
      ensure(C, r.constructorId);
      ensure(QD, r.driverId);
      ensure(QC, r.constructorId);
    }
    hazards.enter(rows);
    for (const q of qrows) {
      ensure(QD, q.driverId);
      ensure(QC, q.constructorId);
    }

    const cir = info.circuitId || '';
    const isWet = wetSet.has(rid);
    const affGet = (id) => aff.get(id)?.get(cir) ?? 0;
    const wetGet = (id) => wet.get(id) ?? 0;
    const rkMult = (id) => {
      const seen = raceSeen.get(id) || 0;
      if (ROOKIE_TAU > 0) return 1 + (ROOKIEB - 1) / (1 + seen / ROOKIE_TAU);
      return seen < ROOKIEN ? ROOKIEB : 1;
    };
    const gridOf = new Map(rows.map((r) => [r.driverId, gridVal(r)]));

    if (prevYear !== null && info.year !== prevYear) {
      // A regulation reset makes last season's car order less informative;
      // REG_CARRY = 1 makes these years behave exactly like any other.
      const rm = REG_RESET_YEARS.has(info.year) ? REG_CARRY : 1;
      const winterCars = (m, longRun, hist, carry) => {
        for (const [cid, v] of [...m]) {
          let target = BASE;
          if (CAR_MEAN) {
            const lr = (longRun.get(cid) ?? v) + CAR_LONG_RATE * (v - (longRun.get(cid) ?? v));
            longRun.set(cid, lr);
            target = BASE + CAR_MEAN * (lr - BASE);
          }
          let next = target + carry * rm * (v - target);
          if (CAR_TREND) {
            const h = hist.get(cid);
            if (h && h.length > 1) next += CAR_TREND * (h[h.length - 1] - h[0]);
            hist.delete(cid);
          }
          m.set(cid, next);
        }
      };
      winterCars(C, carLong, cHist, CARRY);
      winterCars(QC, qcLong, qcHist, QCARRY);
      hazards.winter();
      for (const m of aff.values()) for (const [k, v] of m) m.set(k, v * CIRCCARRY);
      seasonIndex = 0;
    } else if (prevYear !== null) {
      seasonIndex++;
    }
    prevYear = info.year;
    // Car pace is least known just after the winter, so learn fast and settle.
    const kcMult = 1 + (KC_EARLY - 1) * Math.exp(-((seasonIndex * 20) / (seasonSize.get(info.year) || 20)) / KC_TAU);
    // Pre-weekend DNF hazards (decayed history only — knowable pre-race).
    const preQ = hazards.before(rows);

    // Optional research observer. Called before either session updates; the
    // caller must treat these maps as read-only.
    hooks?.beforeWeekend?.({ info, rows, qrows, D, C, QD, QC, raceSeen, preQ });

    // --- Qualifying update (latest common session, teammate-boosted) ---
    // All metrics below are walk-forward: predictions use pre-weekend ratings.
    let qDiag = { obsCount: 0, teammateShare: 0, disruptions: 0, logLoss: NaN, brier: NaN, acc: NaN };
    if (qrows.length >= 2) {
      qualWeekends++;
      const preQD = new Map(QD);
      const preQC = new Map(QC);
      const ds = new Map();
      const dw = new Map();
      const cs = new Map();
      const cw = new Map();
      let tw = 0;
      let allw = 0;
      let loss = 0;
      let lw = 0;
      let brier = 0;
      let hits = 0;
      const qobs = (weekend.qobs ??= buildQualObservations(qrows));
      for (const ob of qobs) {
        const x = ob.x;
        const y = ob.y;
        const same = x.constructorId === y.constructorId;
        const diff = preQD.get(x.driverId) - preQD.get(y.driverId) + (preQC.get(x.constructorId) - preQC.get(y.constructorId));
        const p = eP(diff);
        const res = ob.obs - p;
        // Weight by actual time gap (seconds) instead of rank gap.
        const { gw, wd } = qualWeight(ob, EXAM);
        // wd scores (frozen exam), wl teaches. Identical when qTmLearn is 1.
        const wl = gw * (same ? QTMB * QTM_LEARN : 1);
        hooks?.observation?.({ info, ob, session: 'qual', p, pPre: p, weight: wd });
        add(ds, x.driverId, wl * res);
        add(ds, y.driverId, -wl * res);
        add(dw, x.driverId, wl);
        add(dw, y.driverId, wl);
        allw += 2 * wl;
        if (same) tw += 2 * wl;
        if (!same) {
          add(cs, x.constructorId, gw * res);
          add(cs, y.constructorId, -gw * res);
          add(cw, x.constructorId, gw);
          add(cw, y.constructorId, gw);
        }
        loss += wd * -Math.log(clamp(ob.obs ? p : 1 - p, 1e-12, 1));
        lw += wd;
        brier += wd * res * res;
        if (p > 0.5 === !!ob.obs) hits += wd;
      }
      const ad = new Set(qrows.map((q) => q.driverId));
      const ac = new Set(qrows.map((q) => q.constructorId));
      for (const id of ad) {
        if (dw.get(id) > 0) {
          QD.set(id, preQD.get(id) + (QKD * rkMult(id) * (ds.get(id) || 0)) / dw.get(id));
          qdSeen.set(id, (qdSeen.get(id) || 0) + 1);
        }
      }
      for (const id of ac) {
        if (cw.get(id) > 0) {
          QC.set(id, preQC.get(id) + (QKC * kcMult * (cs.get(id) || 0)) / cw.get(id));
          qcSeen.set(id, (qcSeen.get(id) || 0) + 1);
        }
      }
      centerMap(QD, ad);
      centerMap(QC, ac);
      qDiag = {
        obsCount: qobs.length,
        teammateShare: allw ? tw / allw : 0,
        driverLearnWeight: allw,
        teammateLearnWeight: tw,
        disruptions: lean ? 0 : qrows.filter((q) => qualifyingTreatment(q, info.year, qrows).disrupted).length,
        logLoss: lw ? loss / lw : NaN,
        brier: lw ? brier / lw : NaN,
        acc: lw ? hits / lw : NaN,
        weight: lw,
      };
    }

    // --- Race update (finishes + last-lap snapshots for retirements) ---
    const preD = new Map(D);
    const preC = new Map(C);
    const dsum = new Map();
    const dwgt = new Map();
    const csum = new Map();
    const cwgt = new Map();
    const asum = new Map();
    const awgt = new Map();
    const wsum = new Map();
    const wwgt = new Map();
    let teammateWeight = 0;
    let totalDriverWeight = 0;
    let obsCount = 0;
    let partialObs = 0;
    let carObs = 0;
    let loss = 0;
    let lossW = 0;
    let brier = 0;
    let hits = 0;
    let preLoss = 0;
    let preW = 0;
    let preBrier = 0;
    let preHits = 0;
    let built = obsCache.get(rid);
    if (!built) {
      built = buildRaceObservations({
        rid,
        rows,
        maxLaps,
        lapPace,
        lapSnapshots,
        orderW: ORDERW,
        paceW: PACEW,
        beta: BETA,
      });
      obsCache.set(rid, built);
    }
    const { observations, retirements, recovered } = built;
    totalRetirements += retirements;
    recoveredSnapshots += recovered;
    for (const ob of observations) {
      const x = ob.x;
      const y = ob.y;
      const same = x.constructorId === y.constructorId;
      const base = preD.get(x.driverId) - preD.get(y.driverId) + (preC.get(x.constructorId) - preC.get(y.constructorId));
      let diffPre = base;
      diffPre += affGet(x.driverId) - affGet(y.driverId);
      if (HOME) {
        const cc = cirCountry.get(info.circuitId) || '';
        if (cc) {
          diffPre += HOME * ((isHomeRace(dnat.get(x.driverId), cc) ? 1 : 0) - (isHomeRace(dnat.get(y.driverId), cc) ? 1 : 0));
        }
      }
      let diff = diffPre;
      if (isWet) diff += wetGet(x.driverId) - wetGet(y.driverId);
      const p = eP(diff);
      const res = ob.obs - p;
      const { gw, wd } = raceWeight(ob, EXAM);
      // wd scores (frozen exam), wl teaches. Identical when tmLearn is 1.
      const wl = gw * (same ? TMB * TM_LEARN : 1);
      add(dsum, x.driverId, wl * res);
      add(dsum, y.driverId, -wl * res);
      add(dwgt, x.driverId, wl);
      add(dwgt, y.driverId, wl);
      totalDriverWeight += 2 * wl;
      if (same) teammateWeight += 2 * wl;
      if (!same) {
        add(csum, x.constructorId, gw * res);
        add(csum, y.constructorId, -gw * res);
        add(cwgt, x.constructorId, gw);
        add(cwgt, y.constructorId, gw);
        carObs++;
      }
      // Affinity / wet-skill learn from the pace gradient (grid never leaks in).
      add(asum, x.driverId, wl * res);
      add(asum, y.driverId, -wl * res);
      add(awgt, x.driverId, wl);
      add(awgt, y.driverId, wl);
      if (isWet) {
        add(wsum, x.driverId, wl * res);
        add(wsum, y.driverId, -wl * res);
        add(wwgt, x.driverId, wl);
        add(wwgt, y.driverId, wl);
      }
      // Scoring uses the full pre-race prediction, with the grid advantage.
      const gAdv = info.year <= 2009 ? GRID_REF : GRID_ADV;
      let ps = eP(diff + gAdv * ((gridOf.get(y.driverId) ?? 20) - (gridOf.get(x.driverId) ?? 20)));
      const pPre = eP(diffPre);
      let pPreS = pPre;
      if (HAZW > 0) {
        // Fold pre-weekend DNF risk into the prediction (hazards are knowable).
        const qAx = 1 - (1 - preQ.inc.get(x.driverId)) * (1 - preQ.rel.get(x.constructorId));
        const qBx = 1 - (1 - preQ.inc.get(y.driverId)) * (1 - preQ.rel.get(y.constructorId));
        const psH = headToHeadWithHazard(ps, qAx, qBx, LSTD);
        const pPreH = headToHeadWithHazard(pPre, qAx, qBx, LSTD);
        ps = HAZW >= 1 ? psH : ps * (1 - HAZW) + psH * HAZW;
        pPreS = HAZW >= 1 ? pPreH : pPre * (1 - HAZW) + pPreH * HAZW;
      }
      const resS = ob.obs - ps;
      hooks?.observation?.({ info, ob, session: 'race', p: ps, pPre: pPreS, weight: wd });
      // Pre-weekend scoring: knowable before the weekend (no grid, no wet flag).
      const resPre = ob.obs - pPreS;
      preLoss += wd * -Math.log(clamp(ob.obs ? pPreS : 1 - pPreS, 1e-12, 1));
      preW += wd;
      preBrier += wd * resPre * resPre;
      if (pPreS > 0.5 === !!ob.obs) preHits += wd;
      obsCount++;
      if (ob.source === 'partial') partialObs++;
      loss += wd * -Math.log(clamp(ob.obs ? ps : 1 - ps, 1e-12, 1));
      lossW += wd;
      brier += wd * resS * resS;
      if (ps > 0.5 === !!ob.obs) hits += wd;
    }
    const activeD = new Set(rows.map((r) => r.driverId));
    const activeC = new Set(rows.map((r) => r.constructorId));
    for (const id of activeD) D.set(id, preD.get(id) + (KD * rkMult(id) * (dsum.get(id) || 0)) / (dwgt.get(id) || 1));
    for (const id of activeC) C.set(id, preC.get(id) + (KC * kcMult * (csum.get(id) || 0)) / (cwgt.get(id) || 1));
    centerMap(D, activeD);
    centerMap(C, activeC);
    for (const id of activeD) {
      if (awgt.get(id) > 0) {
        let m = aff.get(id);
        if (!m) {
          m = new Map();
          aff.set(id, m);
        }
        m.set(cir, (m.get(cir) ?? 0) + (CIRCK * (asum.get(id) || 0)) / awgt.get(id));
      }
      if (isWet && wwgt.get(id) > 0) wet.set(id, wetGet(id) + (WETK * (wsum.get(id) || 0)) / wwgt.get(id));
    }
    // Zero-sum this circuit's affinities among active drivers (one circuit per weekend).
    const av = [...activeD].map((id) => affGet(id));
    const am = av.reduce((a, b) => a + b, 0) / Math.max(1, av.length);
    for (const id of activeD) {
      let m = aff.get(id);
      if (!m) {
        m = new Map();
        aff.set(id, m);
      }
      m.set(cir, (m.get(cir) ?? 0) - am);
    }
    // Wet skill is a zero-sum offset (NOT a 1000-centered Elo): recenter on 0.
    if (isWet) {
      const wv = [...activeD].map((id) => wetGet(id));
      const wm = wv.reduce((x, y) => x + y, 0) / Math.max(1, wv.length);
      for (const id of activeD) wet.set(id, wetGet(id) - wm);
    }

    // --- Reliability / incident hazards ---
    const { mechEventWeight, driverEventWeight } = hazards.record(rows, mapFor);
    for (const id of activeD) raceSeen.set(id, (raceSeen.get(id) || 0) + 1);

    // --- Snapshot rows (ratings + hazards + packages) and audit ---
    // A lean build only needs the field hazards that end up in `diag`.
    let ranked = null;
    let qRelField;
    let qIncField;
    if (lean) {
      ({ qRelField, qIncField } = hazards.fieldRates());
    } else {
      ranked = rankWeekend(
        { activeC, activeD, rows, C, D, QC, QD, qcSeen, qdSeen, rel, inc, fieldRel, fieldInc, cname, dname },
        { relPrior: REL_PRIOR, incPrior: INC_PRIOR, stdLaps: LSTD, qualWeight: QW, qualOn: QON, scale: SC },
      );
      ({ qRelField, qIncField } = ranked);
      for (const d of ranked.driverRows) {
        if (!dh.has(d.driverId)) dh.set(d.driverId, []);
        dh.get(d.driverId).push({ ...info, ...d });
      }
      for (const c of ranked.carRows) {
        if (!ch.has(c.constructorId)) ch.set(c.constructorId, []);
        ch.get(c.constructorId).push({ ...info, ...c });
      }
    }
    const diag = {
      teammateShare: totalDriverWeight ? teammateWeight / totalDriverWeight : 0,
      // Absolute learning weights, so a run can aggregate the teammate share of
      // the driver-rating signal exactly rather than averaging per-weekend ratios.
      driverLearnWeight: totalDriverWeight,
      teammateLearnWeight: teammateWeight,
      obsCount,
      partialObs,
      carObs,
      logLoss: lossW ? loss / lossW : NaN,
      brier: lossW ? brier / lossW : NaN,
      acc: lossW ? hits / lossW : NaN,
      weight: lossW,
      preLogLoss: preW ? preLoss / preW : NaN,
      preBrier: preW ? preBrier / preW : NaN,
      preAcc: preW ? preHits / preW : NaN,
      preWeight: preW,
      wet: isWet,
      circuitId: cir,
      qRelField,
      qIncField,
      mechEventWeight,
      driverEventWeight,
      maxLaps,
      q: qDiag,
    };
    if (lean) {
      snaps.push({ ...info, diag });
    } else {
      const { audit, qualAudit } = auditWeekend({ rid, rows, qrows, year: info.year, lapSnapshots, mapFor, dname, cname });
      snaps.push({ ...info, drivers: ranked.driverRows, cars: ranked.carRows, audit, qualAudit, diag });
    }
    if (CAR_TREND) {
      for (const cid of new Set(rows.map((r) => r.constructorId))) {
        pushHist(cHist, cid, C.get(cid));
        pushHist(qcHist, cid, QC.get(cid));
      }
    }
    hooks?.afterWeekend?.({ info, rows, qrows, diag });
    if (!lean) exportRows.push(...exportRowsFor(info, ranked.driverRows, ranked.carMap));
  }

  return {
    dname,
    cname,
    dh,
    ch,
    snaps,
    exportRows,
    recoveredSnapshots,
    totalRetirements,
    qualWeekends,
    affFinal: aff,
    wetFinal: wet,
    circuitList: prep.circuitList,
    params: { ...DEFAULT_PARAMS, ...p },
  };
}
