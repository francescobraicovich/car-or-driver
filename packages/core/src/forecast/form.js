// Causal continuous form features. All state updates happen AFTER both forecasts.
// Current qualifying is exposed only to the post-qualifying race forecast.
import { buildQualObservations, censoredQualifyingIds, censoredQualifyingSegments, qualifyingEvidenceTime } from '../qualifying.js';
import { compareWindows } from '../lap-pace.js';
import { compromisedRacePaceIds } from '../observations.js';
import { isFinishStatusName } from '../status.js';

const clip = (x, a, b) => Math.max(a, Math.min(b, x));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const logit = (p) => Math.log(clip(p, 1e-7, 1 - 1e-7) / (1 - clip(p, 1e-7, 1 - 1e-7)));

function pairTargets(pairs) {
  const sums = new Map(),
    weights = new Map();
  for (const [a, b, delta, w] of pairs) {
    sums.set(a, (sums.get(a) || 0) + w * delta);
    sums.set(b, (sums.get(b) || 0) - w * delta);
    weights.set(a, (weights.get(a) || 0) + w);
    weights.set(b, (weights.get(b) || 0) + w);
  }
  const n = sums.size;
  return new Map([...sums].map(([k, v]) => [k, ((v / weights.get(k)) * (n - 1)) / n]));
}

/**
 * The same features with the recent-form signals set to "no difference".
 * Form features are named `{qual,lap,order}_{fast,slow}` plus `_driver` / `_track`
 * variants, and every one is a difference between the two drivers, so zero means
 * "form says nothing". Used to show how much form moves a forecast.
 */
export function withoutForm(features) {
  const out = { ...features };
  for (const name of Object.keys(out)) if (/^(qual|lap|order)_(fast|slow)/.test(name)) out[name] = 0;
  return out;
}

export function qualTargets(qrows) {
  const pairs = buildQualObservations(qrows).map((o) => [
    o.x.driverId,
    o.y.driverId,
    clip((200 * (o.ty - o.tx)) / (o.tx + o.ty), -5, 5),
    1,
  ]);
  return pairTargets(pairs);
}

class Form {
  constructor(rate) {
    this.rate = rate;
    this.d = new Map();
    this.c = new Map();
    this.track = new Map();
  }
  winter() {
    for (const [k, v] of this.c) this.c.set(k, v * 0.65);
    for (const [k, v] of this.track) this.track.set(k, v * 0.65);
  }
  package(r) {
    return (this.d.get(r.driverId) || 0) + (this.c.get(r.constructorId) || 0);
  }
  update(rows, targets, circuit) {
    const valid = rows.filter((r) => targets.has(r.driverId));
    const teams = new Map();
    for (const r of valid) {
      if (!teams.has(r.constructorId)) teams.set(r.constructorId, []);
      teams.get(r.constructorId).push(r);
    }
    const err = new Map(valid.map((r) => [r.driverId, targets.get(r.driverId) - this.package(r)]));
    for (const [id, rr] of teams) {
      const teamErr = mean(rr.map((r) => err.get(r.driverId)));
      this.c.set(id, (this.c.get(id) || 0) + this.rate * teamErr);
      for (const r of rr) {
        // Teammate contrast identifies persistent driver talent; only a small
        // share of a common team innovation is allocated to the driver.
        this.d.set(r.driverId, (this.d.get(r.driverId) || 0) + this.rate * 0.4 * (err.get(r.driverId) - 0.85 * teamErr));
        const key = `${r.driverId}|${circuit}`;
        this.track.set(key, 0.75 * (this.track.get(key) || 0) + 0.25 * clip(err.get(r.driverId), -2, 2));
      }
    }
  }
}

export class FormFeatures {
  constructor(lapPace) {
    this.lapPace = lapPace;
    this.forms = {};
    this.weekend = -1;
    this.year = null;
    for (const channel of ['qual', 'lap', 'order'])
      for (const speed of ['fast', 'slow']) this.forms[`${channel}_${speed}`] = new Form(speed === 'fast' ? 0.6 : 0.2);
  }
  exportState() {
    return {
      year: this.year,
      weekend: this.weekend,
      forms: Object.fromEntries(Object.entries(this.forms).map(([k, v]) => [k, { rate: v.rate, d: v.d, c: v.c, track: v.track }])),
    };
  }
  importState(saved) {
    this.year = saved.year;
    this.weekend = saved.weekend;
    for (const [k, v] of Object.entries(saved.forms))
      Object.assign(this.forms[k], { ...v, d: new Map(v.d), c: new Map(v.c), track: new Map(v.track) });
  }
  beforeWeekend(w) {
    // The core mutates qualifying maps before race scoring. Copy here so the
    // Thursday features cannot see that same weekend's qualifying update.
    this.w = { ...w, D: new Map(w.D), C: new Map(w.C), QD: new Map(w.QD), QC: new Map(w.QC), raceSeen: new Map(w.raceSeen) };
    this.weekend++;
    if (this.year !== null && w.info.year !== this.year) for (const f of Object.values(this.forms)) f.winter();
    this.year = w.info.year;
    this.qNow = qualTargets(w.qrows);
    this.qpairs = new Map(
      buildQualObservations(w.qrows).flatMap((o) => [
        [`${o.x.driverId}|${o.y.driverId}`, clip((200 * (o.ty - o.tx)) / (o.tx + o.ty), -5, 5)],
        [`${o.y.driverId}|${o.x.driverId}`, clip((200 * (o.tx - o.ty)) / (o.tx + o.ty), -5, 5)],
      ]),
    );
    this.qpos = new Map(w.qrows.map((r) => [r.driverId, +r.position]));
    this.qby = new Map(w.qrows.map((r) => [r.driverId, r]));
    this.qCensoredIds = censoredQualifyingIds(w.qrows);
    this.qCensoredSegments = censoredQualifyingSegments(w.qrows);
    this.qteam = new Map();
    for (const r of w.qrows) {
      if (!this.qteam.has(r.constructorId)) this.qteam.set(r.constructorId, []);
      if (this.qNow.has(r.driverId)) this.qteam.get(r.constructorId).push(this.qNow.get(r.driverId));
    }
  }
  features(x, y, session, p, pPre) {
    const { D, C, QD, QC, raceSeen, info, rows } = this.w;
    const difference = (m, a, b) => (m.get(a) || 0) - (m.get(b) || 0);
    const sc = Math.log(10) / 150;
    const rd = difference(D, x.driverId, y.driverId) * sc;
    const rc = difference(C, x.constructorId, y.constructorId) * sc;
    const qd = difference(QD, x.driverId, y.driverId) * sc;
    const qc = difference(QC, x.constructorId, y.constructorId) * sc;
    const f = { baseline: logit(p), baseline_pre: logit(pPre), race_driver: rd, race_car: rc, qual_driver: qd, qual_car: qc };
    for (const [key, form] of Object.entries(this.forms)) {
      f[key] = form.package(x) - form.package(y);
      f[`${key}_driver`] = difference(form.d, x.driverId, y.driverId);
      f[`${key}_track`] = difference(form.track, `${x.driverId}|${info.circuitId}`, `${y.driverId}|${info.circuitId}`);
    }
    const grid = (r) => (+r.grid > 0 ? +r.grid : rows.length);
    const gridDiff = (grid(y) - grid(x)) / 10;
    const gap = this.qpairs.get(`${x.driverId}|${y.driverId}`);
    const qdiff = (this.qNow.get(x.driverId) || 0) - (this.qNow.get(y.driverId) || 0);
    const qrank = ((this.qpos.get(y.driverId) || rows.length) - (this.qpos.get(x.driverId) || rows.length)) / 10;
    f.grid = gridDiff;
    f.qual_now = qdiff;
    f.qual_gap = gap ?? 0;
    f.qual_rank = qrank;
    f.qual_team_now = mean(this.qteam.get(x.constructorId) || []) - mean(this.qteam.get(y.constructorId) || []);
    f.qual_driver_now = qdiff - f.qual_team_now;
    for (const seg of ['q1', 'q2', 'q3']) {
      const a = this.qCensoredIds.has(x.driverId) ? NaN : qualifyingEvidenceTime(this.qby.get(x.driverId), seg, this.qCensoredSegments);
      const b = this.qCensoredIds.has(y.driverId) ? NaN : qualifyingEvidenceTime(this.qby.get(y.driverId), seg, this.qCensoredSegments);
      f[`current_${seg}`] = Number.isFinite(a + b) ? clip((200 * (b - a)) / (a + b), -5, 5) : 0;
      f[`missing_${seg}`] = Number.isFinite(a + b) ? 0 : 1;
    }
    f.grid_log = Math.log(grid(y) / grid(x));
    // Context is pair-symmetric. It may modulate an antisymmetric signal but
    // cannot reveal the order in which outcome-sorted rows were supplied.
    f.same_team = +(x.constructorId === y.constructorId);
    f.refuel = +(info.year <= 2009);
    f.early = 1 / Math.sqrt(info.round);
    f.q_missing = +(gap == null);
    f.inexperienced = 1 / Math.sqrt(1 + Math.min(raceSeen.get(x.driverId) || 0, raceSeen.get(y.driverId) || 0));
    return f;
  }
  afterWeekend({ info, rows }) {
    const pm = this.lapPace?.get(info.raceId);
    const compromised = compromisedRacePaceIds(rows, Math.max(1, ...rows.map((row) => +row.laps || 0)), pm);
    const pp = [];
    if (pm)
      for (let i = 0; i < rows.length; i++)
        for (let j = i + 1; j < rows.length; j++) {
          const x = rows[i],
            y = rows[j],
            a = pm.get(x.driverId),
            b = pm.get(y.driverId);
          if (!a || !b || compromised.has(x.driverId) || compromised.has(y.driverId)) continue;
          const cw = compareWindows(a.win, b.win);
          if (cw)
            pp.push([x.driverId, y.driverId, clip((cw.faster * 200 * cw.gapSec) / (a.med + b.med), -5, 5), Math.min(1, cw.laps / 16)]);
        }
    const lap = pairTargets(pp);
    const fin = rows.filter((r) => isFinishStatusName(r.statusName));
    const order = pairTargets(
      fin.flatMap((x, i) =>
        fin.slice(i + 1).map((y) => [x.driverId, y.driverId, (4 * (+y.positionOrder - +x.positionOrder)) / rows.length, 1]),
      ),
    );
    for (const [key, form] of Object.entries(this.forms))
      form.update(rows, key.startsWith('qual') ? this.qNow : key.startsWith('lap') ? lap : order, info.circuitId);
  }
}
