// The form-shift fit: exact on synthetic data, centred, and sensible on the real grid.
import assert from 'node:assert/strict';
import { loadData } from '../packages/research/node/common.mjs';
import { buildStateSpace } from '../packages/core/src/state-space/build.js';
import { carFormShifts, fitShifts, formShifts } from '../packages/core/src/forecast/form-shift.js';
import { withoutCarForm, withoutDriverForm, withoutForm } from '../packages/core/src/forecast/form.js';
import { scoreHead } from '../packages/core/src/forecast/inference.js';

const logit = (p) => Math.log(p / (1 - p));

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

// Driver-specific form is removed from the package while car form remains.
{
  const features = {
    qual_fast: 1.5,
    qual_fast_driver: 0.5,
    qual_fast_track: 0.2,
    lap_slow: -0.3,
    lap_slow_driver: 0.1,
    order_fast_track: -0.4,
    baseline_pre: 0.25,
  };
  const out = withoutDriverForm(features);
  assert.equal(out.qual_fast, 1, 'the driver term is subtracted from the package signal');
  assert.equal(out.lap_slow, -0.4, 'slow driver form is subtracted too');
  assert.equal(out.qual_fast_driver, 0);
  assert.equal(out.lap_slow_driver, 0);
  assert.equal(out.qual_fast_track, 0);
  assert.equal(out.order_fast_track, 0);
  assert.equal(out.baseline_pre, features.baseline_pre, 'non-form signals are retained');
  assert.equal(features.qual_fast, 1.5, 'the input is not mutated');
}

// Explicit and legacy form bases can coexist without inventing missing features.
{
  const features = {
    qual_fast: 1.5,
    qual_fast_driver: 0.5,
    lap_slow: -0.3,
    lap_slow_driver: 0.1,
    lap_slow_car: -0.4,
    innovation_order_fast_driver: 0.2,
    innovation_order_fast_car: -0.7,
    baseline_pre: 0.4,
  };
  const driverOff = withoutDriverForm(features),
    carOff = withoutCarForm(features),
    bothOff = withoutForm(features);
  assert.equal(driverOff.qual_fast, 1);
  assert.equal(driverOff.innovation_order_fast_driver, 0);
  assert.equal(driverOff.innovation_order_fast_car, -0.7);
  assert.equal(carOff.qual_fast, 0.5);
  assert(Math.abs(carOff.lap_slow - 0.1) < 1e-12);
  assert.equal(carOff.lap_slow_car, 0);
  assert.equal(carOff.innovation_order_fast_driver, 0.2);
  assert.equal(carOff.innovation_order_fast_car, 0);
  assert(!Object.hasOwn(driverOff, 'innovation_order_fast') && !Object.hasOwn(carOff, 'innovation_order_fast'));
  assert.equal(bothOff.innovation_order_fast_driver, 0);
  assert.equal(bothOff.innovation_order_fast_car, 0);
  assert.equal(bothOff.baseline_pre, 0.4);
}

// Synthetic head separates driver form from car form and permits both teammates to be above the field mean.
{
  const drivers = new Map([
    ['a', 0.7],
    ['b', 0.5],
    ['c', -0.6],
    ['d', -0.6],
  ]);
  const teams = new Map([
    ['a', 'x'],
    ['b', 'x'],
    ['c', 'y'],
    ['d', 'y'],
  ]);
  const cars = new Map([
    ['x', 0.3],
    ['y', -0.3],
  ]);
  const head = { family: 'linear', names: ['qual_fast', 'qual_fast_driver'], coefficients: [1, 0.5] };
  const contribution = (driverGap, carGap) => {
    const features = {
      qual_fast: driverGap + carGap,
      qual_fast_driver: driverGap,
      qual_fast_track: 0.2,
    };
    return logit(scoreHead(head, features)) - logit(scoreHead(head, withoutDriverForm(features)));
  };
  const ids = [...drivers.keys()];
  const shifts = fitShifts(ids, (a, b) => contribution(drivers.get(a) - drivers.get(b), cars.get(teams.get(a)) - cars.get(teams.get(b))));
  for (const id of ids) assert.ok(Math.abs(shifts.get(id) - 1.5 * drivers.get(id)) < 1e-6, `isolates driver contribution for ${id}`);
  assert.ok(shifts.get('a') > 0 && shifts.get('b') > 0, 'two teammates can both receive positive field-relative shifts');
  assert.ok(Math.abs([...shifts.values()].reduce((sum, value) => sum + value, 0)) < 1e-6, 'driver shifts are centred over the full field');
  const carOnly = fitShifts(ids, (a, b) => contribution(0, cars.get(teams.get(a)) - cars.get(teams.get(b))));
  assert.ok(
    [...carOnly.values()].every((value) => Math.abs(value) < 1e-6),
    'car form alone produces no driver form shift',
  );
  assert.ok(Math.abs(contribution(0.2, 0.1) + contribution(-0.2, -0.1)) < 1e-6, 'the contribution reverses with pair orientation');
}

// Car attribution uses the complementary ablation and preserves driver form.
{
  const head = { family: 'linear', names: ['lap_fast', 'lap_fast_driver', 'innovation_lap_fast_car'], coefficients: [1, 0.5, 2] };
  const contribution = (driver, car, innovationCar) => {
    const features = { lap_fast: driver + car, lap_fast_driver: driver, lap_fast_car: car, innovation_lap_fast_car: innovationCar };
    return logit(scoreHead(head, features)) - logit(scoreHead(head, withoutCarForm(features)));
  };
  assert(Math.abs(contribution(0.3, 0, 0)) < 1e-10, 'driver form alone has no car contribution');
  assert(Math.abs(contribution(0.2, 0.3, 0.1) - 0.5) < 1e-6);
  assert(Math.abs(contribution(0.2, 0.3, 0.1) + contribution(-0.2, -0.3, -0.1)) < 1e-9);
  const shifts = fitShifts(['x', 'y'], (a, b) => contribution(0, a === 'x' && b === 'y' ? 0.6 : -0.6, 0));
  assert(Math.abs(shifts.get('x') - 0.3) < 1e-6 && Math.abs(shifts.get('y') + 0.3) < 1e-6);
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
  assert.ok(Math.abs(values.reduce((s, v) => s + v, 0)) < 1e-6, 'shifts are globally centred');
  assert.ok(Math.max(...values) - Math.min(...values) > 1, 'and they are not all zero');
  assert.equal(formShifts(model), shifts, 'cached per model');
  const cars = carFormShifts(model);
  const currentCars = model.snaps.at(-1).cars;
  assert.deepEqual(
    new Set(cars.keys()),
    new Set(currentCars.map((car) => String(car.constructorId))),
    'one shift per car on the latest grid',
  );
  assert([...cars.values()].every(Number.isFinite));
  assert(Math.abs([...cars.values()].reduce((sum, value) => sum + value, 0)) < 1e-6, 'car shifts are globally centred');
  assert.equal(carFormShifts(model), cars, 'car shifts are cached per model');
  assert.equal(carFormShifts({ ...model, forecastState: undefined }), null);

  assert.equal(formShifts({ ...model, forecastState: undefined }), null, 'a model without a forecast layer has no form shift');
  console.log(
    `computed ${grid.length} shifts in ${ms.toFixed(0)} ms; range ${Math.min(...values).toFixed(1)} to ${Math.max(...values).toFixed(1)} points`,
  );
}
console.log('PASS form shift: driver contribution, car-only control, symmetry, global centering, current grid');
