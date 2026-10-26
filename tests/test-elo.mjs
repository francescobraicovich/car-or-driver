import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadData } from '../packages/research/node/common.mjs';
import { buildEloCore } from '../packages/core/src/elo-core.js';
import { buildEloForecast } from '../packages/core/src/elo-forecast.js';
import { TUNED_ELO } from '../packages/core/src/presets/tuned-elo.js';
import { FormFeatures } from '../packages/core/src/forecast/form.js';
import { ELO_HEADS } from '../packages/core/src/elo-forecast-heads.js';
import { scoreHead, selectHeads } from '../packages/core/src/forecast/inference.js';
import { summarizeBacktest } from '../packages/core/src/backtest.js';
import { forecastPair } from '../packages/core/src/forecast/prepare.js';

const fixtures = JSON.parse(await readFile('research/inference-fixtures.json', 'utf8'));
for (const f of fixtures)
  assert.ok(Math.abs(scoreHead(ELO_HEADS[f.year][f.mode], f.features) - f.expected) < 1e-11, 'Python/JS inference parity');
console.log(`PASS ${fixtures.length} Python/JS inference fixtures`);

const ctx = await loadData();
// Compare a full-data feature replay with a truncated dataset: future labels,
// results, qualifying and lap evidence cannot influence an earlier feature.
function capture(raw, snaps, pace, limit) {
  const form = new FormFeatures(pace);
  const rows = [];
  buildEloCore(raw, snaps, ctx.maps, TUNED_ELO, pace, {
    beforeWeekend: (w) => form.beforeWeekend(w),
    observation: ({ info, ob, session, p, pPre, weight }) => {
      if (info.year === limit)
        rows.push([info.raceId, ob.x.driverId, ob.y.driverId, session, ob.obs, weight, form.features(ob.x, ob.y, session, p, pPre)]);
    },
    afterWeekend: (w) => form.afterWeekend(w),
  });
  return rows;
}
const limit = 2010;
const ids = new Set(ctx.raw.races.filter((r) => +r.year <= limit).map((r) => String(r.raceId)));
const raw = {
  ...ctx.raw,
  races: ctx.raw.races.filter((r) => ids.has(String(r.raceId))),
  results: ctx.raw.results.filter((r) => ids.has(String(r.raceId))),
  qualifying: ctx.raw.qualifying.filter((r) => ids.has(String(r.raceId))),
};
const snaps = new Map([...ctx.lapSnapshots].filter(([k]) => ids.has(k.split('|')[0])));
const pace = new Map([...ctx.lapPace].filter(([k]) => ids.has(k)));
const full = capture(ctx.raw, ctx.lapSnapshots, ctx.lapPace, limit),
  prefix = capture(raw, snaps, pace, limit);
assert.deepEqual(full, prefix);
console.log(`PASS future-data prefix invariance (${full.length} observations)`);

// Thursday/qualifying heads must be insensitive to current-weekend qualifying
// values and grids; also verify snapshot maps are copied before core updates.
const sample = ctx.raw.results
  .filter((r) => String(r.raceId) === full[0][0])
  .map((r) => ({ ...r, driverId: String(r.driverId), constructorId: String(r.constructorId) }));
const qr = ctx.raw.qualifying.filter((r) => String(r.raceId) === full[0][0]);
const w = {
  info: { year: 2010, round: 3, circuitId: '1' },
  rows: sample,
  qrows: qr,
  D: new Map(sample.map((r) => [r.driverId, 1000 + (Number(r.driverId) % 50)])),
  C: new Map(sample.map((r) => [r.constructorId, 1000])),
  QD: new Map(sample.map((r) => [r.driverId, 1000])),
  QC: new Map(sample.map((r) => [r.constructorId, 1000])),
  raceSeen: new Map(),
};
const a = new FormFeatures(null);
a.beforeWeekend(w);
const f = a.features(sample[0], sample[1], 'race', 0.6, 0.6);
for (const k of w.QD.keys()) w.QD.set(k, 99999);
assert.deepEqual(a.features(sample[0], sample[1], 'race', 0.6, 0.6), f);
const b = new FormFeatures(null);
b.beforeWeekend({
  ...w,
  QD: new Map(sample.map((r) => [r.driverId, 1000])),
  rows: sample.map((r) => ({ ...r, grid: Math.max(1, 25 - +r.grid) })),
  qrows: qr.map((r) => ({ ...r, q1: '2:40.111', q2: '2:39.222', q3: '2:38.333', position: 99 - +r.position })),
});
const altered = b.features(b.w.rows[0], b.w.rows[1], 'race', 0.6, 0.6);
for (const key of Object.keys(ELO_HEADS))
  for (const mode of ['pre', 'qual']) assert.equal(scoreHead(ELO_HEADS[key][mode], f), scoreHead(ELO_HEADS[key][mode], altered));
const reversed = a.features(sample[1], sample[0], 'race', 0.4, 0.4);
for (const key of Object.keys(ELO_HEADS))
  for (const mode of ['pre', 'qual', 'grid', 'post'])
    assert.ok(Math.abs(scoreHead(ELO_HEADS[key][mode], f) + scoreHead(ELO_HEADS[key][mode], reversed) - 1) < 1e-12, 'swap symmetry');
console.log('PASS Thursday availability, map isolation, and driver-swap symmetry');

// The Elo model must reproduce its own ratings exactly (the heads are a probability layer, they never feed back into the ratings).
const core = buildEloCore(ctx.raw, ctx.lapSnapshots, ctx.maps, TUNED_ELO, ctx.lapPace);
const elo = buildEloForecast(ctx.raw, ctx.lapSnapshots, ctx.maps, {}, ctx.lapPace);
for (let i = 0; i < core.snaps.length; i++) {
  const x = core.snaps[i],
    y = elo.snaps[i];
  assert.deepEqual(x.drivers, y.drivers);
  assert.deepEqual(x.cars, y.cars);
  for (const k of ['weight', 'preWeight', 'obsCount']) assert.equal(x.diag[k], y.diag[k]);
  assert.equal(x.diag.q.weight, y.diag.q.weight);
}
// The research report records the old 2000-start model; these are the 1994-start
// replay values for the same 2000–2015 evaluation window.
const expected = JSON.parse(await readFile('research/final-results.json', 'utf8'));
const historical = summarizeBacktest(elo, { burnIn: 20, fromYear: 2000, toYear: 2015 });
assert.ok(Math.abs(historical.overall.combinedLogLoss - 0.34316386459166587) < 1e-10);
assert.ok(Math.abs(historical.overall.preCombinedLogLoss - 0.3849958281506682) < 1e-10);
const rolling = summarizeBacktest(elo, { burnIn: 20, fromYear: 2016, toYear: 2100 });
assert.ok(Number.isFinite(rolling.overall.combinedLogLoss));
assert.ok(Number.isFinite(rolling.overall.preCombinedLogLoss));
assert.ok(rolling.overall.weekends >= expected.windows.terminal_2016plus.elo_post.weekends);
const drivers = elo.snaps.at(-1).drivers;
const before = JSON.stringify([...elo.forecastState.form.forms.qual_fast.c]);
const p = forecastPair(elo, drivers[0].driverId, drivers[1].driverId).p;
const reverse = forecastPair(elo, drivers[1].driverId, drivers[0].driverId).p;
assert.ok(Math.abs(p + reverse - 1) < 1e-12);
assert.equal(before, JSON.stringify([...elo.forecastState.form.forms.qual_fast.c]));
assert.equal(selectHeads(ELO_HEADS, 2007), null);
assert.equal(selectHeads(ELO_HEADS, 2015), ELO_HEADS[2012]);
console.log('PASS frozen scoring/rating invariance, end-to-end backtest parity, forecast symmetry');
