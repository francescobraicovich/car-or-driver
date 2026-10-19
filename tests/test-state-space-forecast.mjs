// The forecast layer on the state-space ratings: the shipped heads reproduce their Python fits, and serving
// computes the heads' inputs the way training did.
//
//   * STATE_SPACE_HEADS against the fixtures written when they were fitted (Python and JS must agree);
//   * the training path (replay of the whole history) records the Thursday head's output for real pairs at one
//     mid-season weekend; a model built only from earlier weekends then forecasts the same pairs with the serving
//     code, and the two must agree within what the paths legitimately differ by (hazards decay one race later in
//     training).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadData } from '../packages/research/node/common.mjs';
import { buildStateSpace, runSession } from '../packages/core/src/state-space/build.js';
import { collectExam } from '../packages/core/src/state-space/exam.js';
import { replayForecastLayer } from '../packages/core/src/state-space/replay.js';
import { STATE_SPACE_HEADS } from '../packages/core/src/state-space/forecast-heads.js';
import { scoreHead } from '../packages/core/src/forecast/inference.js';
import { forecastPair } from '../packages/core/src/forecast/prepare.js';

const fixtures = JSON.parse(await readFile('research/state-space/inference-fixtures.json', 'utf8'));
for (const f of fixtures)
  assert.ok(
    Math.abs(scoreHead(STATE_SPACE_HEADS[f.year][f.mode], f.features) - f.expected) < 1e-9,
    'Python/JS inference parity (state-space heads)',
  );
console.log(`PASS ${fixtures.length} Python/JS inference fixtures for the state-space heads`);

const ctx = await loadData('data');
const YEAR = 2014;
const ROUND = 10;
const race = ctx.raw.races.find((r) => +r.year === YEAR && +r.round === ROUND);
const before = (r) => +r.year < YEAR || (+r.year === YEAR && +r.round < ROUND);

// training path
const { model: full, weekends } = collectExam(ctx.raw, ctx.lapSnapshots, ctx.maps, {}, ctx.lapPace);
const tm = full.params.tmBoost;
const qualRun = runSession(weekends, 'qual', tm);
const recorded = [];
replayForecastLayer(
  weekends,
  { race: runSession(weekends, 'race', tm, qualRun).pre, qual: qualRun.pre },
  {
    lapPace: ctx.lapPace,
    params: full.params,
    heads: STATE_SPACE_HEADS,
    onRow: ({ info, session, ob, predicted }) => {
      if (String(info.raceId) !== String(race.raceId) || session !== 'race' || recorded.length >= 40) return;
      recorded.push({ a: ob.x.driverId, b: ob.y.driverId, pre: predicted.pre });
    },
  },
);
assert.ok(recorded.length >= 20, `recorded ${recorded.length} observations at ${YEAR} round ${ROUND}`);

// serving path
const keep = new Set(ctx.raw.races.filter(before).map((r) => String(r.raceId)));
const model = buildStateSpace(
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
let worst = 0;
let total = 0;
for (const r of pairs) {
  const s = forecastPair(model, String(r.a), String(r.b), { L: 60, circuitId: race.circuitId, year: YEAR, round: ROUND });
  const d = Math.abs(s.p - r.pre);
  worst = Math.max(worst, d);
  total += d;
}
console.log(
  `serving vs training on ${pairs.length} pairs: mean |diff| ${((100 * total) / pairs.length).toFixed(2)} pp, worst ${(100 * worst).toFixed(2)} pp`,
);
assert.ok(total / pairs.length < 0.006, 'serving reproduces the training path (mean difference under 0.6 points)');
assert.ok(worst < 0.03, 'and no pair is far off (under 3 points)');
// negative control: serving with a different baseline (here no hazard mix) must be caught by the same comparison
let controlTotal = 0;
for (const r of pairs) {
  const s = forecastPair({ ...model, params: { ...model.params, hazardW: 0 } }, String(r.a), String(r.b), {
    L: 60,
    year: YEAR,
    round: ROUND,
  });
  controlTotal += Math.abs(s.p - r.pre);
}
console.log(`control, no hazard mix: mean |diff| ${((100 * controlTotal) / pairs.length).toFixed(2)} pp`);
assert.ok(controlTotal / pairs.length > 3 * Math.max(total / pairs.length, 1e-4), 'the test would have caught a different baseline');
console.log('PASS state-space forecast parity: serving matches the training path');
