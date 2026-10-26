// The ratings shown on the site blend the joint state-space filters with a
// forward-only comparison learner (hybrid/ratings.js).
//
// buildStateSpace collects the exam (state-space/exam.js: the observations of every weekend, the retirement hazards and the skeleton of the
// snapshots), runs the state-space filters (qualifying, then the race filter that reads it) on the observations, and then
//   - fills every snapshot row and the per-driver / per-car histories with the ratings, deriving combined, effective and
//     package pace from them,
//   - adds `ssDiag` (ratings-alone forecast quality, per weekend),
//   - replays the forecast layer (form trackers and probability heads) with the hybrid levels, as forecast
//     before each weekend, as its rating inputs (replay.js, inputs.js), and writes its per-weekend scores to `diag`.
// A `benchmark` (elo-benchmark.js) can be passed to add the Elo model's ratings on the same exam next to these, so the two
// rating systems can be compared; without one nothing here reads the Elo core.
import { MODEL_SETTINGS } from '../presets/model-settings.js';
import { hybridRatings } from '../hybrid/ratings.js';
import { BASE, combineRating, gapToP, pToRating } from '../math.js';
import { headToHeadWithHazard } from '../hazard.js';
import { CONSTRUCTOR_LINEAGE, carIdentity } from '../lineage.js';
import { exportRowsFor } from '../report.js';
import { collectExam } from './exam.js';
import { addDiag, emptyDiag, finishDiag } from './diagnostics.js';
import { STATE_SPACE } from '../presets/state-space.js';
import { STATE_SPACE_FIT } from '../presets/state-space-fit.js';
import { runStateSpace } from './filter.js';
import { arrivalOffsets, qualLink } from './qualifying-link.js';
import { replayForecastLayer } from './replay.js';
import { STATE_SPACE_HEADS } from './forecast-heads.js';

// A team continuing under another constructor id (rename or takeover) is the same team for "did the driver move".
const parent = new Map();
const find = (x) => (parent.get(x) === undefined || parent.get(x) === x ? x : find(parent.get(x)));
for (const t of CONSTRUCTOR_LINEAGE) parent.set(find(t.to), find(t.from));
export const canonicalTeam = (id) => find(String(id));

// The car carries over only across a rename; after a takeover it starts fresh, as in the Elo core (docs/elo.md,
// "Rookies and team continuity").
export const carLineage = carIdentity;

/** What the filters need besides their settings: team and car identity, and the exam's teammate boost. */
export const ssContext = (tmBoost) => ({ canon: canonicalTeam, carOf: carLineage, tmBoost });

/**
 * The filter over one session ('race' or 'qual') of the collected weekends. Qualifying is independent of the race; the race filter reads the
 * qualifying run (`qualRun`, the output of this function for 'qual') through the cross-session link of the settings (`STATE_SPACE.link`,
 * state-space/qualifying-link.js). Without a `qualRun`, or with the link off, the race filter runs alone.
 */
export function runSession(weekends, session, tmBoost, qualRun = null) {
  const link = STATE_SPACE.link;
  const linked = session === 'race' && qualRun && link && (link.beta || link.gamma);
  return runStateSpace(
    weekends.map((w) => ({ year: w.year, rows: w.rows, obs: session === 'race' ? w.raceObs : w.qualObs })),
    STATE_SPACE[session],
    {
      ...ssContext(tmBoost),
      ...(linked ? qualLink(qualRun, link.beta, link.gamma) : {}),
      ...(session === 'race' && STATE_SPACE.adapt?.dip ? { adapt: arrivalOffsets(weekends, canonicalTeam, STATE_SPACE.adapt) } : {}),
    },
  );
}

/**
 * Qualifying first, then the race filter reading it: the race ratings depend on the qualifying run, so the two run one after the other.
 * @param {{ observe, attach }} [options.benchmark]  the Elo benchmark (elo-benchmark.js), or none
 */
export function buildStateSpace(raw, lapSnapshots, maps, params, lapPace = null, { benchmark = null } = {}) {
  const data = { raw, lapSnapshots, maps, lapPace };
  const exam = collectExam(raw, lapSnapshots, maps, params, lapPace);
  benchmark?.observe(exam, data);
  const tmBoost = exam.model.params.tmBoost;
  const qual = runSession(exam.weekends, 'qual', tmBoost);
  const race = runSession(exam.weekends, 'race', tmBoost, qual);
  const hybrid = hybridRatings(exam.weekends, exam.model.snaps, race, qual, carLineage);
  const model = finishStateSpace(exam.model, exam.weekends, hybrid, qual, data);
  benchmark?.attach(model, exam, data);
  return model;
}

/** Everything after the filters: diagnostics, replaced ratings and rebuilt derived numbers. */
export function finishStateSpace(model, weekends, race, qual, { raw, lapPace }) {
  const params = MODEL_SETTINGS;

  // ---- ratings-alone diagnostics on the exam's observations
  const kRace = Math.LN10 / STATE_SPACE.race.s;
  const kQual = Math.LN10 / STATE_SPACE.qual.s;
  const slopes = STATE_SPACE_FIT.slopes;
  const ssZ = (pred, q, k, c) => (c * k * pred.mean[q]) / Math.sqrt(1 + (Math.PI / 8) * k * k * pred.vari[q]);
  weekends.forEach((w, i) => {
    const ss = { race: emptyDiag(), qual: emptyDiag() };
    w.raceObs.forEach((o, q) => {
      addDiag(ss.race, ssZ(race.predictions[i], q, kRace, slopes.race), o.o, o.w);
    });
    w.qualObs.forEach((o, q) => {
      addDiag(ss.qual, ssZ(qual.predictions[i], q, kQual, slopes.qual), o.o, o.w);
    });
    model.snaps[i].ssDiag = finishDiag(ss.race, ss.qual);
  });

  // ---- replace the ratings, rebuilding everything derived from them
  const eP = (d) => gapToP(d, params.scale);
  const eFP = (x) => pToRating(x, params.scale);
  const LSTD = params.stdLaps;
  const QW = params.qualWeight;
  const dh = new Map();
  const ch = new Map();
  const exportRows = [];
  model.snaps.forEach((snap, i) => {
    const rr = race.ratings[i];
    const qr = qual.ratings[i];
    const qRelField = snap.diag.qRelField;
    const qIncField = snap.diag.qIncField;
    const info = { raceId: snap.raceId, year: snap.year, round: snap.round, name: snap.name, date: snap.date, circuitId: snap.circuitId };
    const infoKeys = Object.keys(snap).filter((k) => !['drivers', 'cars', 'audit', 'qualAudit', 'diag', 'ssDiag'].includes(k));
    for (const k of infoKeys) info[k] = snap[k];

    const rebuild = (row, id, r, q, hazardField, kind) => {
      const re = r.get(id);
      const qe = q.get(id);
      const race1000 = BASE + re.m;
      const qual1000 = qe?.seen ? BASE + qe.m : BASE; // no qualifying data yet: neutral, and combined falls back to race
      const combined = combineRating(race1000, qual1000, qe?.seen ? 1 : 0, QW, params.qualOn);
      const sdR = re.sd;
      const sdQ = qe ? qe.sd : 0;
      const w = qe?.seen ? Math.min(1, Math.max(0, QW)) : 0;
      return {
        ...row,
        race: race1000,
        qual: qual1000,
        combined,
        raceSd: sdR,
        qualSd: sdQ,
        combinedSd: Math.sqrt((1 - w) ** 2 * sdR ** 2 + w ** 2 * sdQ ** 2),
        effective: eFP(headToHeadWithHazard(eP(combined - BASE), row.q, hazardField, LSTD)),
        kind,
        // a driver in his first races (after the first season of data) has a provisional rating
        ...(kind === 'driver' ? { races: re.n, newDriver: !!re.rookie } : {}),
      };
    };
    const cars = snap.cars.map((c) => rebuild(c, c.constructorId, rr.cars, qr.cars, qRelField, 'car'));
    const carMap = new Map(cars.map((c) => [c.constructorId, c]));
    const drivers = snap.drivers.map((d) => {
      const row = rebuild(d, d.driverId, rr.drivers, qr.drivers, qIncField, 'driver');
      const car = carMap.get(d.constructorId);
      const packagePace = car ? BASE + (row.combined - BASE) + (car.combined - BASE) : row.combined;
      const qPkg = car ? 1 - (1 - d.q) * (1 - car.q) : d.q;
      const qFieldPkg = 1 - (1 - qIncField) * (1 - qRelField);
      return {
        ...row,
        packagePace,
        packageEffective: eFP(headToHeadWithHazard(eP(packagePace - BASE), qPkg, qFieldPkg, LSTD)),
      };
    });
    drivers.sort((a, b) => b.effective - a.effective);
    cars.sort((a, b) => b.effective - a.effective);
    snap.drivers = drivers;
    snap.cars = cars;
    exportRows.push(...exportRowsFor(info, drivers, carMap));
    for (const d of drivers) {
      if (!dh.has(d.driverId)) dh.set(d.driverId, []);
      dh.get(d.driverId).push({ ...info, ...d });
    }
    for (const c of cars) {
      if (!ch.has(c.constructorId)) ch.set(c.constructorId, []);
      ch.get(c.constructorId).push({ ...info, ...c });
    }
  });
  model.dh = dh;
  model.ch = ch;
  model.exportRows = exportRows; // the downloadable table carries the published (state-space) ratings, not the Elo benchmark's
  model.ss = {
    latest: { race: race.latest, qual: qual.latest },
    slopes,
    scenario: STATE_SPACE_FIT.scenario,
  };
  model.params = { ...MODEL_SETTINGS, modelKind: 'state-space', ratingMethod: 'hybrid' };

  // ---- the forecast layer: form trackers and probability heads, on the hybrid levels as forecast before each weekend
  const { form, diags } = replayForecastLayer(weekends, { race: race.pre, qual: qual.pre }, { lapPace, params, heads: STATE_SPACE_HEADS });
  model.snaps.forEach((snap, i) => {
    const d = snap.diag;
    const { q, ...race1 } = diags[i];
    Object.assign(d, race1);
    Object.assign(d.q, q);
  });
  model.forecastState = {
    form: form.exportState(),
    seen: new Map(form.w.raceSeen),
    nationalities: new Map(raw.drivers.map((d) => [String(d.driverId), d.nationality])),
    countries: new Map((raw.circuits || []).map((c) => [String(c.circuitId), c.country])),
  };
  for (const r of form.w.rows) model.forecastState.seen.set(r.driverId, (model.forecastState.seen.get(r.driverId) || 0) + 1);
  return model;
}
