// Research-only causal form candidates; long-term ratings are read-only inputs.
import { FormFeatures } from '../../packages/core/src/forecast/form.js';
import { MODEL_SETTINGS } from '../../packages/core/src/presets/model-settings.js';
import { carIdentity } from '../../packages/core/src/lineage.js';
import { compareWindows } from '../../packages/core/src/lap-pace.js';

const CHANNELS = ['qual', 'lap', 'order'];
const SPEEDS = { fast: 0.6, slow: 0.2 };
const RETENTION = 2 ** (-1 / 10);
const K = Math.LN10 / 75;
const clip = (value, low, high) => Math.max(low, Math.min(high, value));

class FormState {
  constructor(rate) {
    this.rate = rate;
    this.d = new Map();
    this.c = new Map();
    this.track = null;
  }
  package(row) { return (this.d.get(String(row.driverId)) ?? 0) + (this.c.get(carIdentity(row.constructorId)) ?? 0); }
  winter() {} // Aging, including winter, is applied once by beforeWeekend.
  age(retention) {
    for (const map of [this.d, this.c]) for (const [id, value] of map) map.set(id, value * retention);
  }
  export() { return { rate: this.rate, d: new Map(this.d), c: new Map(this.c) }; }
  import(state) { this.rate = state.rate; this.d = new Map(state.d); this.c = new Map(state.c); }
}

const states = () => Object.fromEntries(CHANNELS.flatMap((channel) =>
  Object.entries(SPEEDS).map(([speed, rate]) => [`${channel}_${speed}`, new FormState(rate)])));
const copyStates = (forms) => Object.fromEntries(Object.entries(forms).map(([name, state]) => [name, state.export()]));
const restoreStates = (forms, saved) => { for (const [name, state] of Object.entries(saved)) forms[name].import(state); };

// Rows can include duplicate or opposite orientations. Equally supported
// conflicting evidence is discarded instead of depending on input order.
function selectPairs(replayObs, rows, lapPace, raceId) {
  const selected = Object.fromEntries(CHANNELS.map((name) => [name, new Map()]));
  const participants = new Map(rows.map((row) => [String(row.driverId), row]));
  const raceValid = Math.max(0, ...rows.map((row) => Number(row.laps) || 0)) >= 2;
  for (const { ob, session } of replayObs) {
    let a = String(ob.x.driverId), b = String(ob.y.driverId);
    if (a === b || !participants.has(a) || !participants.has(b) || ![0, 1].includes(ob.obs)) continue;
    let outcome = ob.obs, sign = 1;
    if (a > b) { [a, b] = [b, a]; outcome = 1 - outcome; sign = -1; }
    let channel, quality, priority, target;
    if (session === 'qual' && ['q1', 'q2', 'q3'].includes(ob.seg) && Number.isFinite(ob.tx) && Number.isFinite(ob.ty) && ob.tx !== ob.ty) {
      channel = 'qual'; quality = 1; priority = 1;
      target = sign * clip(200 * (ob.ty - ob.tx) / (ob.tx + ob.ty), -5, 5);
    } else if (session === 'race' && raceValid && ob.source === 'paceW' && Number.isFinite(ob.base) && ob.base > 0) {
      channel = 'lap'; priority = 1;
      const pm = lapPace?.get(String(raceId));
      const x = pm?.get(String(ob.x.driverId)), y = pm?.get(String(ob.y.driverId));
      const matched = x && y ? compareWindows(x.win, y.win) : null;
      quality = clip(matched ? matched.laps / 16 : ob.base / MODEL_SETTINGS.paceW, 0, 1);
      target = x && y && Number.isFinite(ob.gapSec) && x.med + y.med > 0
        ? sign * (ob.obs ? 1 : -1) * clip(200 * ob.gapSec / (x.med + y.med), 0, 5) : null;
    } else if (session === 'race' && raceValid && ['finish', 'partial'].includes(ob.source) && Number.isFinite(ob.base) && ob.base > 0) {
      channel = 'order'; priority = ob.source === 'finish' ? 2 : 1;
      quality = ob.source === 'finish' ? 1 : clip(ob.base, 0, 1);
      target = (outcome ? 1 : -1) * 4 * Math.abs(Number(ob.gap) || 0) / Math.max(1, participants.size);
    } else continue;
    if (!(quality > 0)) continue;
    const key = JSON.stringify([a, b]);
    const candidate = { a, b, outcome, quality, priority, target, carA: carIdentity(participants.get(a).constructorId), carB: carIdentity(participants.get(b).constructorId) };
    const previous = selected[channel].get(key);
    if (!previous || priority > previous.priority || (priority === previous.priority && quality > previous.quality)) selected[channel].set(key, candidate);
    else if (priority === previous.priority && quality === previous.quality) {
      if (previous.outcome !== outcome) previous.conflict = true;
      else if (!previous.conflict && Number.isFinite(target) && (!Number.isFinite(previous.target) || Math.abs(target) < Math.abs(previous.target))) {
        selected[channel].set(key, candidate);
      }
    }
  }
  return Object.fromEntries(CHANNELS.map((channel) => [channel, [...selected[channel].values()].filter((item) => !item.conflict)]));
}

// Positive-definite ridge normal equations, solved by Cholesky factorization.
function solve(matrix, vector) {
  const n = vector.length, lower = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let value = matrix[i][j];
    for (let k = 0; k < j; k++) value -= lower[i][k] * lower[j][k];
    lower[i][j] = i === j ? Math.sqrt(value) : value / lower[j][j];
  }
  const answer = Float64Array.from(vector);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) answer[i] -= lower[i][j] * answer[j];
    answer[i] /= lower[i][i];
  }
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j < n; j++) answer[i] -= lower[j][i] * answer[j];
    answer[i] /= lower[i][i];
  }
  return answer;
}

function pairTargets(pairs, rows, maps, innovation) {
  if (!innovation) pairs = pairs.filter((pair) => Number.isFinite(pair.target));
  const ids = [...new Set(pairs.flatMap(({ a, b }) => [a, b]))].sort();
  const cars = [...new Set(pairs.flatMap(({ carA, carB }) => [carA, carB]))].sort();
  const keys = [...ids.map((id) => `d:${id}`), ...cars.map((id) => `c:${id}`)];
  const index = new Map(keys.map((key, i) => [key, i]));
  const n = keys.length, matrix = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => Number(i === j)));
  const vector = new Float64Array(n), support = new Float64Array(n);
  const rowById = new Map(rows.map((row) => [String(row.driverId), row]));
  const opportunities = Math.max(1, rowById.size - 1);
  for (const pair of pairs) {
    const { a, b, carA, carB } = pair;
    let residual = pair.target, curvature = 1;
    if (innovation) {
      const rowA = rowById.get(a), rowB = rowById.get(b);
      const value = (map, id) => map.get(id) ?? 0;
      const gap = value(maps.drivers, a) - value(maps.drivers, b) + value(maps.cars, String(rowA.constructorId)) - value(maps.cars, String(rowB.constructorId));
      const probability = 1 / (1 + Math.exp(-clip(K * gap, -30, 30)));
      residual = pair.outcome - probability;
      curvature = probability * (1 - probability);
    }
    const weight = pair.quality / opportunities;
    const terms = [[index.get(`d:${a}`), 1], [index.get(`d:${b}`), -1],
      ...(carA === carB ? [] : [[index.get(`c:${carA}`), 1], [index.get(`c:${carB}`), -1]])];
    for (const [i, x] of terms) {
      support[i] += weight;
      vector[i] += weight * x * residual;
      for (const [j, y] of terms) matrix[i][j] += weight * curvature * x * y;
    }
  }
  const target = solve(matrix, vector);
  return { keys, target, support };
}

function updateForms(forms, channel, pairs, rows, maps, innovation) {
  if (!pairs.length) return;
  const { keys, target, support } = pairTargets(pairs, rows, maps, innovation);
  for (const speed of Object.keys(SPEEDS)) {
    const state = forms[`${channel}_${speed}`];
    for (let i = 0; i < keys.length; i++) {
      if (!(support[i] > 0)) continue;
      const map = keys[i].startsWith('d:') ? state.d : state.c, id = keys[i].slice(2);
      const old = map.get(id) ?? 0, rate = state.rate * Math.min(1, support[i]);
      map.set(id, old + rate * (target[i] - old));
    }
  }
}

class CandidateFormFeatures extends FormFeatures {
  constructor(lapPace, method) {
    super(lapPace, { track: false });
    this.method = method;
    this.forms = states();
    this.innovationForms = method === 'combined' ? states() : null;
  }
  beforeWeekend(weekend) {
    if (this.year !== null) {
      const years = Math.max(0, weekend.info.year - this.year);
      const retention = RETENTION * 0.65 ** years;
      for (const state of Object.values(this.forms)) state.age(retention);
      if (this.innovationForms) for (const state of Object.values(this.innovationForms)) state.age(retention);
    }
    super.beforeWeekend(weekend);
    this.featureForms = states();
    restoreStates(this.featureForms, copyStates(this.forms));
    if (this.innovationForms) {
      this.featureInnovationForms = states();
      restoreStates(this.featureInnovationForms, copyStates(this.innovationForms));
    }
  }
  features(x, y, session, p, pPre) {
    const liveForms = this.forms;
    this.forms = this.featureForms;
    let result;
    try { result = super.features(x, y, session, p, pPre); }
    finally { this.forms = liveForms; }
    const add = (forms, prefix) => {
      for (const [key, state] of Object.entries(forms)) {
        const driver = (state.d.get(String(x.driverId)) ?? 0) - (state.d.get(String(y.driverId)) ?? 0);
        const car = (state.c.get(carIdentity(x.constructorId)) ?? 0) - (state.c.get(carIdentity(y.constructorId)) ?? 0);
        if (prefix) { result[`${prefix}${key}_driver`] = driver; result[`${prefix}${key}_car`] = car; }
        else result[`${key}_car`] = car;
      }
    };
    add(this.featureForms, '');
    if (this.featureInnovationForms) add(this.featureInnovationForms, 'innovation_');
    return result;
  }
  afterWeekend({ info, rows, replayObs }) {
    if (!replayObs) throw Error('Form candidates require the exam replay observations');
    const selected = selectPairs(replayObs, rows, this.lapPace, info.raceId);
    for (const channel of CHANNELS) {
      const maps = channel === 'qual' ? { drivers: this.w.QD, cars: this.w.QC } : { drivers: this.w.D, cars: this.w.C };
      if (this.method !== 'innovation') updateForms(this.forms, channel, selected[channel], rows, maps, false);
      if (this.method === 'innovation') updateForms(this.forms, channel, selected[channel], rows, maps, true);
      if (this.innovationForms) updateForms(this.innovationForms, channel, selected[channel], rows, maps, true);
    }
  }
  exportState() {
    return { method: this.method, year: this.year, weekend: this.weekend, forms: copyStates(this.forms),
      ...(this.innovationForms ? { innovationForms: copyStates(this.innovationForms) } : {}) };
  }
  importState(saved) {
    if (saved.method !== this.method) throw Error('Form state method mismatch');
    this.year = saved.year; this.weekend = saved.weekend;
    restoreStates(this.forms, saved.forms);
    if (this.innovationForms) restoreStates(this.innovationForms, saved.innovationForms);
  }
}

export class ContinuousFormFeatures extends CandidateFormFeatures { constructor(lapPace) { super(lapPace, 'continuous'); } }
export class InnovationFormFeatures extends CandidateFormFeatures { constructor(lapPace) { super(lapPace, 'innovation'); } }
export class CombinedFormFeatures extends CandidateFormFeatures { constructor(lapPace) { super(lapPace, 'combined'); } }
