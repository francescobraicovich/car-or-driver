// Compare the retained grid-only head on original and final production rating inputs.
import { writeFile } from 'node:fs/promises';
import { load } from '../../packages/research/node/strict-eval.mjs';
import { runSession, carLineage } from '../../packages/core/src/state-space/build.js';
import { hybridRatings } from '../../packages/core/src/hybrid/ratings.js';
import { replayForecastLayer } from '../../packages/core/src/state-space/replay.js';
import { scoreHead, selectHeads } from '../../packages/core/src/forecast/inference.js';
import { rankingCandidates } from './candidates-ranking.mjs';
import { referenceHeads } from './reference-heads.mjs';

const heads = await referenceHeads();
const env = await load(2026, true);
const weekends = env.prep.weekends;
const original = rankingCandidates.control(env);
const tm = env.prep.ctx.tmBoost;
const qual = runSession(weekends, 'qual', tm);
const race = runSession(weekends, 'race', tm, qual);
const production = hybridRatings(weekends, race, qual, carLineage);
const collect = (levels) => {
  const rows = [];
  replayForecastLayer(weekends, levels, {
    lapPace: env.prep.data.lapPace,
    params: env.prep.model.params,
    heads: null,
    formOptions: { track: false },
    onRow: ({ info, session, ob, weight, features }) => {
      if (session === 'race' && info.year >= 2008) rows.push({ year: info.year, a: ob.x.driverId, b: ob.y.driverId, o: ob.obs, weight, features });
    },
  });
  return rows;
};
const before = collect({ race: original.race.pre, qual: original.qual.pre });
const after = collect({ race: production.pre, qual: qual.pre });
if (before.length !== after.length) throw Error(`Observation count changed: ${before.length} vs ${after.length}`);
const records = before.map((row, index) => {
  const next = after[index];
  if (row.year !== next.year || row.a !== next.a || row.b !== next.b || row.o !== next.o || row.weight !== next.weight) throw Error(`Observation stream differs at ${index}`);
  const head = selectHeads(heads, row.year).grid;
  const oldP = scoreHead(head, row.features);
  const newP = scoreHead(head, next.features);
  return { year: row.year, weight: row.weight, outcome: row.o, oldP, newP };
});
const historical = records.filter((row) => row.year <= 2025);
const loss = (p, y) => -Math.log(Math.max(1e-12, y ? p : 1 - p));
const metrics = (rows) => {
  const weight = rows.reduce((s, r) => s + r.weight, 0);
  return Object.fromEntries(['old', 'new'].map((which) => [which, {
    logLoss: rows.reduce((s, r) => s + r.weight * loss(r[`${which}P`], r.outcome), 0) / weight,
    brier: rows.reduce((s, r) => s + r.weight * (r.outcome - r[`${which}P`]) ** 2, 0) / weight,
  }]));
};
const groups = { '2008-2011': (y) => y >= 2008 && y <= 2011, '2012-2015': (y) => y >= 2012 && y <= 2015, '2016-2020': (y) => y >= 2016 && y <= 2020, '2021-2025': (y) => y >= 2021 && y <= 2025, '2026-monitoring': (y) => y === 2026 };
const byYear = new Map([...new Set(records.map((r) => r.year))].map((year) => {
  const rows = records.filter((r) => r.year === year);
  return [year, { rows: rows.length, weight: rows.reduce((s, r) => s + r.weight, 0),
    oldLoss: rows.reduce((s, r) => s + r.weight * loss(r.oldP, r.outcome), 0), newLoss: rows.reduce((s, r) => s + r.weight * loss(r.newP, r.outcome), 0),
    oldBrier: rows.reduce((s, r) => s + r.weight * (r.outcome - r.oldP) ** 2, 0), newBrier: rows.reduce((s, r) => s + r.weight * (r.outcome - r.newP) ** 2, 0) }];
}));
let seed = 4202026;
const random = (n) => Math.floor(((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32) * n);
const bootstrap = (rows, replicates = 4000) => {
  const years = [...new Set(rows.map((r) => r.year))];
  const deltas = Array.from({ length: replicates }, () => {
    const sums = { weight: 0, oldLoss: 0, newLoss: 0, oldBrier: 0, newBrier: 0 };
    for (let i = 0; i < years.length; i++) {
      const season = byYear.get(years[random(years.length)]);
      for (const key of Object.keys(sums)) sums[key] += season[key];
    }
    return [(sums.newLoss - sums.oldLoss) / sums.weight, (sums.newBrier - sums.oldBrier) / sums.weight];
  });
  const interval = (column) => {
    const values = deltas.map((d) => d[column]).sort((a, b) => a - b);
    return [values[Math.floor(0.025 * replicates)], values[Math.floor(0.975 * replicates)]];
  };
  return { seasons: years.length, logLossDelta95: interval(0), brierDelta95: interval(1) };
};
const result = {
  comparison: 'original grid-head coefficients on original full versus final production rounded rating inputs',
  rows: records.length,
  historicalRows: historical.length,
  pooled: { ...metrics(historical), pairedSeasonBootstrap: bootstrap(historical) },
  folds: Object.fromEntries(Object.entries(groups).map(([name, include]) => {
    const rows = records.filter((r) => include(r.year));
    return [name, rows.length ? { rows: rows.length, ...metrics(rows), pairedSeasonBootstrap: name === '2026-monitoring' ? null : bootstrap(rows) } : null];
  })),
  seasons: Object.fromEntries([...byYear].map(([year, value]) => [year, { rows: value.rows, old: { logLoss: value.oldLoss / value.weight, brier: value.oldBrier / value.weight }, new: { logLoss: value.newLoss / value.weight, brier: value.newBrier / value.weight } }])),
};
const delta = (cell) => cell.new.logLoss - cell.old.logLoss;
result.pointGuards = {
  pooled: delta(result.pooled) <= 0.001,
  folds: Object.fromEntries(Object.entries(result.folds).filter(([name]) => name !== '2026-monitoring').map(([name, cell]) => [name, cell !== null && delta(cell) <= 0.002])),
};
result.accepted = result.pointGuards.pooled && Object.values(result.pointGuards.folds).every(Boolean);
await writeFile('research/simplification/grid-forecast-check.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ accepted: result.accepted, pooledLossDelta: delta(result.pooled), pointGuards: result.pointGuards }));
if (!result.accepted) throw Error('Grid-only forecast point guards failed');
