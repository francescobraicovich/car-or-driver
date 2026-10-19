// Serving must compute the heads' inputs the way training did. This was wrong
// once (a hard-coded Elo scale), and nothing caught it, so check it directly:
//
//   * build the whole history and record, at one mid-season weekend, the head
//     output the training path produced for real pairs of drivers;
//   * build only the weekends before it and forecast the same pairs with the
//     serving code (forecastPair);
//   * the two must agree to within the small differences the paths legitimately
//     have (hazard decay happens one race later in training).
import assert from 'node:assert/strict';
import { loadData } from '../packages/research/node/common.mjs';
import { buildEloCore } from '../packages/core/src/elo-core.js';
import { buildEloForecast } from '../packages/core/src/elo-forecast.js';
import { FormFeatures } from '../packages/core/src/forecast/form.js';
import { ELO_HEADS } from '../packages/core/src/elo-forecast-heads.js';
import { scoreHead, selectHeads } from '../packages/core/src/forecast/inference.js';
import { forecastPair } from '../packages/core/src/forecast/prepare.js';
import { TUNED_ELO } from '../packages/core/src/presets/tuned-elo.js';

const ctx = await loadData('data');
const YEAR = 2014;
const ROUND = 10; // mid-season: no winter reset between this weekend and the one before
const race = ctx.raw.races.find((r) => +r.year === YEAR && +r.round === ROUND);
const before = (r) => +r.year < YEAR || (+r.year === YEAR && +r.round < ROUND);

// 1) Training path: the pre-weekend head output for real observations at the target weekend.
const form = new FormFeatures(ctx.lapPace);
let heads = null;
let at = false;
const recorded = [];
buildEloCore(ctx.raw, ctx.lapSnapshots, ctx.maps, TUNED_ELO, ctx.lapPace, {
  beforeWeekend: (w) => {
    form.beforeWeekend(w);
    heads = selectHeads(ELO_HEADS, w.info.year);
    at = String(w.info.raceId) === String(race.raceId);
  },
  observation: ({ ob, session, p, pPre }) => {
    if (!at || session !== 'race' || !heads || recorded.length >= 40) return;
    recorded.push({ a: ob.x.driverId, b: ob.y.driverId, pre: scoreHead(heads.pre, form.features(ob.x, ob.y, session, p, pPre)) });
  },
  afterWeekend: (w) => form.afterWeekend(w),
});
assert.ok(recorded.length >= 20, `recorded ${recorded.length} observations at ${YEAR} round ${ROUND}`);

// 2) Serving path: the model as it stood just before that weekend.
const keep = new Set(ctx.raw.races.filter(before).map((r) => String(r.raceId)));
const model = buildEloForecast(
  {
    ...ctx.raw,
    races: ctx.raw.races.filter(before),
    results: ctx.raw.results.filter((r) => keep.has(String(r.raceId))),
    qualifying: ctx.raw.qualifying.filter((r) => keep.has(String(r.raceId))),
  },
  new Map([...ctx.lapSnapshots].filter(([k]) => keep.has(String(k).split('|')[0]))),
  ctx.maps,
  {},
  new Map([...ctx.lapPace].filter(([k]) => keep.has(String(k)))),
);
const onGrid = new Set(model.snaps.at(-1).drivers.map((d) => String(d.driverId)));
const pairs = recorded.filter((r) => onGrid.has(String(r.a)) && onGrid.has(String(r.b)));
assert.ok(pairs.length >= 15, `${pairs.length} pairs comparable`);

const gap = (m, laps) => {
  let worst = 0;
  let total = 0;
  for (const r of pairs) {
    const s = forecastPair(m, String(r.a), String(r.b), { L: laps, circuitId: race.circuitId, year: YEAR, round: ROUND });
    const d = Math.abs(s.p - r.pre);
    worst = Math.max(worst, d);
    total += d;
  }
  return { worst, mean: total / pairs.length };
};

const served = gap(model, 60);
console.log(
  `serving vs training on ${pairs.length} pairs: mean |diff| ${(100 * served.mean).toFixed(2)} pp, worst ${(100 * served.worst).toFixed(2)} pp`,
);
assert.ok(served.mean < 0.006, 'serving reproduces the training path (mean difference under 0.6 points)');
assert.ok(served.worst < 0.03, 'and no pair is far off (under 3 points)');

// Negative control: the old serving settings must be caught by this same check.
const old = gap({ ...model, params: { ...model.params, scale: 150, stdLaps: 60 } }, 60);
console.log(`control, old settings (scale 150, 60 laps): mean |diff| ${(100 * old.mean).toFixed(2)} pp`);
assert.ok(old.mean > 2 * served.mean, 'the test would have caught the old hard-coded scale');

console.log('PASS forecast parity: serving matches the training path');
