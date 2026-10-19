// The Elo benchmark attached to the state-space model: the Elo core run over the same exam, so that the two rating systems can be
// compared on identical observations. Everything Elo-specific that a state-space model carries comes from here and nowhere else:
//   - `pElo` on every observation, the Elo model's own forecast (`p`, `pPre`) on every replayed observation, and the Elo levels before
//     each weekend (`eloD`, `eloC`, `eloQD`, `eloQC`), on the exam's weekends,
//   - `eloDiag` on every snapshot, and `eloRace`, `eloQual`, `eloCombined`, `eloEffective` (`eloPackagePace` for drivers) on every row,
//   - the diagnostics of the Elo loop's learning weights (`teammateShare`, `driverLearnWeight`, `teammateLearnWeight`),
//   - the circuit-affinity and wet-skill tracks (`affFinal`, `wetFinal`) that the what-if scenarios read; they are learned from the
//     Elo ratings' residuals.
// buildStateSpace(..., { benchmark: eloBenchmark }) attaches it; without it a state-space model has none of these.
import { buildEloCore } from './elo-core.js';
import { gapToP } from './math.js';
import { TUNED_ELO } from './presets/tuned-elo.js';
import { STATE_SPACE_FIT } from './presets/state-space-fit.js';
import { collectExam } from './state-space/exam.js';
import { addDiag, emptyDiag, finishDiag, logit } from './state-space/diagnostics.js';

const WEIGHT_DIAGNOSTICS = ['teammateShare', 'driverLearnWeight', 'teammateLearnWeight'];

/** Run the Elo core over the exam's data (sharing its prepared weekends and observations) and annotate the exam with it. */
function observe(exam, { raw, lapSnapshots, maps, lapPace }) {
  const { weekends } = exam;
  let k = -1;
  let cur = null;
  let iq = 0;
  let ir = 0;
  let ic = 0;
  const observer = {
    beforeWeekend: (w) => {
      cur = weekends[++k];
      if (!cur || String(cur.info.raceId) !== String(w.info.raceId))
        throw Error('The Elo benchmark and the exam are out of step (weekends).');
      cur.eloD = new Map(w.D);
      cur.eloC = new Map(w.C);
      cur.eloQD = new Map(w.QD);
      cur.eloQC = new Map(w.QC);
      iq = 0;
      ir = 0;
      ic = 0;
    },
    observation: ({ ob, session, p, pPre }) => {
      const qual = session === 'qual';
      const D = qual ? cur.eloQD : cur.eloD;
      const C = qual ? cur.eloQC : cur.eloC;
      const diff = D.get(ob.x.driverId) - D.get(ob.y.driverId) + (C.get(ob.x.constructorId) - C.get(ob.y.constructorId));
      const target = (qual ? cur.qualObs : cur.raceObs)[qual ? iq++ : ir++];
      if (!target || target.x !== String(ob.x.driverId) || target.y !== String(ob.y.driverId))
        throw Error('The Elo benchmark and the exam are out of step (observations).');
      target.pElo = gapToP(diff, TUNED_ELO.scale);
      const replayed = cur.replayObs[ic++];
      if (replayed?.ob !== ob) throw Error('The Elo benchmark and the exam are out of step (replay).');
      replayed.p = p;
      replayed.pPre = pPre;
    },
  };
  exam.elo = buildEloCore(raw, lapSnapshots, maps, TUNED_ELO, lapPace, observer, { cache: exam.cache });
}

/** After finishStateSpace: put the Elo model's numbers next to the state-space ones, in the snapshots and in the histories. */
function attach(model, exam) {
  const { weekends, elo } = exam;
  const slopes = STATE_SPACE_FIT.slopes;
  model.affFinal = elo.affFinal;
  model.wetFinal = elo.wetFinal;
  const nextD = new Map();
  const nextC = new Map();
  model.snaps.forEach((snap, i) => {
    const w = weekends[i];
    const es = elo.snaps[i];
    const acc = { race: emptyDiag(), qual: emptyDiag() };
    for (const o of w.raceObs) addDiag(acc.race, slopes.eloRace * logit(o.pElo), o.o, o.w);
    for (const o of w.qualObs) addDiag(acc.qual, slopes.eloQual * logit(o.pElo), o.o, o.w);
    snap.eloDiag = finishDiag(acc.race, acc.qual);
    for (const key of WEIGHT_DIAGNOSTICS) {
      if (key in es.diag) snap.diag[key] = es.diag[key];
      if (key in es.diag.q) snap.diag.q[key] = es.diag.q[key];
    }

    const eloDriver = new Map(es.drivers.map((r) => [r.driverId, r]));
    const eloCar = new Map(es.cars.map((r) => [r.constructorId, r]));
    const put = (rows, key, byId, history, next, extra) => {
      for (const row of rows) {
        const e = byId.get(row[key]);
        const fields = {
          eloRace: e.race,
          eloQual: e.qual,
          eloCombined: e.combined,
          eloEffective: e.effective,
          ...(extra ? { [extra]: e.packagePace } : {}),
        };
        const at = next.get(row[key]) ?? 0;
        next.set(row[key], at + 1);
        Object.assign(row, fields);
        Object.assign(history.get(row[key])[at], fields);
      }
    };
    put(snap.cars, 'constructorId', eloCar, model.ch, nextC, null);
    put(snap.drivers, 'driverId', eloDriver, model.dh, nextD, 'eloPackagePace');
  });
}

export const eloBenchmark = { observe, attach };

/** The exam with the Elo benchmark's levels and predictions on it (what the harness and the calibration scripts compare against). */
export function collectExamWithElo(raw, lapSnapshots, maps, params, lapPace = null) {
  const exam = collectExam(raw, lapSnapshots, maps, params, lapPace);
  observe(exam, { raw, lapSnapshots, maps, lapPace });
  return exam;
}
