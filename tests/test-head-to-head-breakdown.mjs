// The Head to head page explains a forecast as three steps (ratings alone,
// calibrated, with recent form). Those steps must be consistent with the headline.
import assert from 'node:assert/strict';
import { loadData } from '../packages/research/node/common.mjs';
import { buildStateSpace } from '../packages/core/src/state-space/build.js';
import { forecastPair } from '../packages/core/src/forecast/prepare.js';
import { withoutCarForm, withoutDriverForm, withoutForm } from '../packages/core/src/forecast/form.js';

// withoutForm zeroes the form signals and nothing else
const f = {
  baseline: 0.3,
  race_driver: 0.2,
  same_team: 1,
  grid: 0.4,
  qual_fast: -0.1,
  qual_fast_driver: -0.04,
  qual_fast_track: 0.03,
  lap_slow_driver: 0.2,
  order_fast_track: 0.1,
  qual_now: 0.5,
};
const z = withoutForm(f);
assert.deepEqual([z.qual_fast, z.lap_slow_driver, z.order_fast_track], [0, 0, 0]);
assert.deepEqual(
  [z.baseline, z.race_driver, z.same_team, z.grid, z.qual_now],
  [0.3, 0.2, 1, 0.4, 0.5],
  'ratings, context and qualifying are kept',
);
assert.equal(f.qual_fast, -0.1, 'the input is not mutated');
const carOff = withoutCarForm(f);
assert.equal(carOff.qual_fast, f.qual_fast_driver, 'legacy package keeps the driver contribution');
const driverOff = withoutDriverForm(f);
assert.ok(Math.abs(driverOff.qual_fast + 0.06) < 1e-12, 'driver form is removed from its package signal while car form remains');
assert.equal(driverOff.qual_fast_driver, 0, 'driver-specific form is removed');
assert.equal(driverOff.order_fast_track, 0, 'track form is removed');
assert.equal(driverOff.baseline, 0.3, 'ratings remain available');

const ctx = await loadData('data');
const model = buildStateSpace(ctx.raw, ctx.lapSnapshots, ctx.maps, {}, ctx.lapPace);
const grid = model.snaps.at(-1).drivers;
const ids = grid.slice(0, 6).map((d) => String(d.driverId));
const team = grid.find((d) => grid.some((o) => o !== d && o.constructorId === d.constructorId));
const mate = grid.find((o) => o !== team && o.constructorId === team.constructorId);

for (const [a, b] of [
  [ids[0], ids[1]],
  [ids[2], ids[5]],
  [String(team.driverId), String(mate.driverId)],
]) {
  const r = forecastPair(model, a, b, { L: 60 });
  const s = forecastPair(model, b, a, { L: 60 });
  assert.equal(r.breakdown.full, r.p, 'the last step is the headline');
  for (const key of ['ratings', 'calibrated', 'driverFormOff', 'carFormOff', 'full']) {
    assert.ok(r.breakdown[key] > 0 && r.breakdown[key] < 1, `${key} is a probability`);
    assert.ok(Math.abs(r.breakdown[key] + s.breakdown[key] - 1) < 1e-9, `${key} is symmetric when the drivers are swapped`);
  }
  if (a === String(team.driverId) && b === String(mate.driverId))
    assert(Math.abs(r.breakdown.full - r.breakdown.carFormOff) < 1e-12, 'same-car form cancels');
  assert.ok(Number.isFinite(r.gap), 'the rating gap used is exposed');
}
console.log('PASS head to head: breakdown ends at the headline and is symmetric');
