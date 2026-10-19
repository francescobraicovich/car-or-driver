// The form-shift fit: exact on synthetic data, centred, and sensible on the real grid.
import assert from 'node:assert/strict';
import { loadData } from '../packages/research/node/common.mjs';
import { buildStateSpace } from '../packages/core/src/state-space/build.js';
import { fitShifts, formShifts, removeTeamMean } from '../packages/core/src/forecast/form-shift.js';

// 1) Synthetic: a complete matrix built from known thetas is recovered exactly.
{
  const truth = new Map([
    ['a', 0.9],
    ['b', 0.3],
    ['c', -0.2],
    ['d', -1.0],
  ]); // sums to 0
  const ids = [...truth.keys()];
  const fit = fitShifts(ids, (x, y) => truth.get(x) - truth.get(y));
  for (const id of ids) assert.ok(Math.abs(fit.get(id) - truth.get(id)) < 1e-12, `recovers ${id}`);
  assert.ok(Math.abs([...fit.values()].reduce((s, v) => s + v, 0)) < 1e-12, 'fitted values sum to zero');
  // a constant offset in the truth is not recoverable and is centred away
  const shifted = fitShifts(ids, (x, y) => truth.get(x) + 5 - (truth.get(y) + 5));
  assert.ok(Math.abs(shifted.get('a') - 0.9) < 1e-12);
  // noisy, non-additive matrix: still antisymmetric-consistent and centred
  const noisy = fitShifts(ids, (x, y) => (x < y ? 1 : -1) * 0.4);
  assert.ok(Math.abs([...noisy.values()].reduce((s, v) => s + v, 0)) < 1e-12);
  assert.ok(noisy.get('a') > noisy.get('d'), 'the entity that always wins ranks above the one that always loses');
}

// 1b) Team mean removal: contrasts between teammates survive, the car's level does not.
{
  const team = { a: 'x', b: 'x', c: 'y', d: 'z' };
  const out = removeTeamMean(
    new Map([
      ['a', 10],
      ['b', 4],
      ['c', -50],
      ['d', 7],
    ]),
    (id) => team[id],
  );
  assert.deepEqual(
    [...out],
    [
      ['a', 3],
      ['b', -3],
      ['c', 0],
      ['d', 0],
    ],
    'a pair keeps its contrast; a lone driver gets none',
  );
}

// 2) Real grid
{
  const ctx = await loadData('data');
  const model = buildStateSpace(ctx.raw, ctx.lapSnapshots, ctx.maps, {}, ctx.lapPace);
  const t0 = performance.now();
  const shifts = formShifts(model);
  const ms = performance.now() - t0;
  const grid = model.snaps.at(-1).drivers;
  assert.equal(shifts.size, grid.length, 'one shift per driver on the latest grid');
  const values = [...shifts.values()];
  assert.ok(values.every(Number.isFinite), 'all finite');
  assert.ok(Math.abs(values.reduce((s, v) => s + v, 0)) < 1e-6, 'shifts are centred on zero');
  const byTeam = new Map();
  for (const d of grid) byTeam.set(d.constructorId, (byTeam.get(d.constructorId) || 0) + shifts.get(String(d.driverId)));
  for (const [team, sum] of byTeam) assert.ok(Math.abs(sum) < 1e-6, `team ${team} sums to zero, so the car does not move its drivers`);
  assert.ok(
    Math.max(...values.map(Math.abs)) < 30,
    `shifts are a modest adjustment, not a new rating (largest ${Math.max(...values.map(Math.abs)).toFixed(1)} points)`,
  );
  assert.ok(Math.max(...values) - Math.min(...values) > 1, 'and they are not all zero');
  assert.equal(formShifts(model), shifts, 'cached per model');
  assert.equal(formShifts({ ...model, forecastState: undefined }), null, 'a model without a forecast layer has no form shift');
  console.log(
    `computed ${grid.length} shifts in ${ms.toFixed(0)} ms; range ${Math.min(...values).toFixed(1)} to ${Math.max(...values).toFixed(1)} points`,
  );
}
console.log('PASS form shift: exact on synthetic data, centred, sensible on the current grid');
