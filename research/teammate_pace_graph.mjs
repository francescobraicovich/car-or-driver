// Research-only dated career graph of within-team continuous pace comparisons.
// All drivers use the same evidence, fading, and regularisation. Car ratings
// come from an independent forward-only run, so they cancel on graph edges.
import { compareWindows } from '../packages/core/src/lap-pace.js';
import { solveRows } from './alternative_rating_models.mjs';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const seconds = (value) => {
  if (!value || value === '\\N') return NaN;
  const sections = value.split(':');
  return sections.length === 2 ? 60 * +sections[0] + +sections[1] : +value;
};

export function teammatePaceGraph(timeline, data, carRun, carOf, options = {}) {
  const memoryYears = options.memoryYears ?? 8;
  const fade = options.fade ?? 0.8;
  const ridge = options.ridge ?? 1;
  const qualifyingWeight = options.qualifyingWeight ?? 1;
  const racePaceWeight = options.racePaceWeight ?? 1;
  const outcomeWeight = options.outcomeWeight ?? 0.15;
  const pointsPerSecond = options.pointsPerSecond ?? 35;
  const experienceEnabled = options.experienceEnabled ?? false;
  const experienceRidge = options.experienceRidge ?? 1;
  const experienceScale = options.experienceScale ?? 20;
  const starts = new Map();
  const experience = (id) => Math.log1p((starts.get(id) ?? 0) / experienceScale);
  const qByRace = new Map();
  for (const row of data.raw.qualifying) {
    const raceId = String(row.raceId);
    if (!qByRace.has(raceId)) qByRace.set(raceId, new Map());
    qByRace.get(raceId).set(String(row.driverId), seconds(row.q1));
  }
  const graph = [];
  const pre = [];
  const post = [];
  const z = [];
  let level = new Map();
  const add = (year, a, b, gap, weight) => {
    if (!(weight > 0) || !Number.isFinite(gap) || Math.abs(gap) > 2.5) return;
    graph.push({ year, features: [[a, 1], [b, -1],
      ...(experienceEnabled ? [['experience', experience(a) - experience(b)]] : [])],
      target: clamp(pointsPerSecond * gap, -90, 90), weight });
  };
  for (const [i, weekend] of timeline.entries()) {
    const base = carRun.pre[i];
    const driver = (id) => (level.get(id) ?? 0) + (experienceEnabled ? (level.get('experience') ?? 0) * experience(id) : 0);
    const rated = new Map([...base.rated.keys()].map((id) => [id, driver(id)]));
    pre.push({ ...base, rated, drivers: rated });
    const oldZ = carRun.z[i];
    const plain = new Float64Array(oldZ.plain.length);
    const adj = new Float64Array(oldZ.adj.length);
    for (const [j, ob] of weekend.obs.race.entries()) {
      const oldGap = base.rated.get(ob.x) - base.rated.get(ob.y);
      const change = carRun.k * (driver(ob.x) - driver(ob.y) - oldGap);
      const attenuation = oldZ.vari ? Math.sqrt(1 + (Math.PI / 8) * carRun.k ** 2 * oldZ.vari[j]) : 1;
      plain[j] = oldZ.plain[j] + change;
      adj[j] = oldZ.adj[j] + change / attenuation;
    }
    z.push({ ...oldZ, plain, adj });
    const teams = new Map();
    for (const row of weekend.rows) {
      const id = String(row.driverId);
      const team = carOf(String(row.constructorId));
      if (!teams.has(team)) teams.set(team, []);
      teams.get(team).push(id);
    }
    const q = qByRace.get(weekend.raceId) ?? new Map();
    const lap = data.lapPace.get(weekend.raceId) ?? new Map();
    for (const ids of teams.values()) for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const x = ids[a];
      const y = ids[b];
      if (Number.isFinite(q.get(x)) && Number.isFinite(q.get(y)))
        add(weekend.year, x, y, q.get(y) - q.get(x), qualifyingWeight);
      const lx = lap.get(x);
      const ly = lap.get(y);
      if (lx?.win && ly?.win && lx.n >= 10 && ly.n >= 10) {
        const matched = compareWindows(lx.win, ly.win);
        if (matched) add(weekend.year, x, y, matched.faster * matched.gapSec,
          racePaceWeight * Math.min(2, matched.laps / 20));
      }
      const outcomes = weekend.obs.race.filter((ob) => ob.same &&
        ((ob.x === x && ob.y === y) || (ob.x === y && ob.y === x)));
      if (outcomes.length) {
        const weight = outcomes.reduce((sum, ob) => sum + ob.w, 0);
        const win = outcomes.reduce((sum, ob) => sum + ob.w * (ob.x === x ? ob.o : 1 - ob.o), 0) / weight;
        add(weekend.year, x, y, (win - 0.5) * 1.4, outcomeWeight);
      }
    }
    const rows = graph.filter((row) => weekend.year - row.year <= memoryYears)
      .map((row) => ({ ...row, weight: row.weight * fade ** (weekend.year - row.year) }));
    level = solveRows(rows, (key) => key === 'experience' ? experienceRidge : ridge);
    for (const entry of weekend.rows) {
      const id = String(entry.driverId);
      starts.set(id, (starts.get(id) ?? 0) + 1);
    }
    post.push({ ...carRun.post[i], drivers: new Map([...carRun.post[i].drivers].map(([id, value]) =>
      [id, { ...value, m: driver(id) }])) });
  }
  return { ...carRun, name: 'teammate-pace-career-graph', pre, post, z };
}
