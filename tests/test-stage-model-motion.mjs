import assert from 'node:assert/strict';
import { advanceSceneMotion, createSceneMotion, transformModelPoint } from '../site/js/stage-model-motion.js';
import { loadStageModel, normalizeStageModel } from '../site/js/stage-model-assets.js';
import { readFile } from 'node:fs/promises';

const input = { now: 0, subject: 'driver', reducedMotion: false };
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const distance = (matrix) => Math.hypot(...Array.from(matrix, (value, index) => value - identity[index]));
const state = createSceneMotion();
const initial = advanceSceneMotion(state, input);
assert.equal(initial.selection.driver, 1, 'the default driver is fully illuminated on arrival');
assert.equal(distance(initial.matrices.driver), 0, 'the selected driver starts in its presentation pose');
const initialCar = Array.from(initial.matrices.car);
let result;
for (let frame = 1; frame <= 300; frame++) result = advanceSceneMotion(state, { ...input, now: (frame * 1000) / 30 });
assert.equal(distance(result.matrices.driver), 0, 'the selected model remains aligned');
assert.ok(
  Math.abs(result.matrices.car[5] - initialCar[5]) > 0.1 && Math.abs(result.matrices.car[2] - initialCar[2]) > 0.1,
  'the inactive model visibly rotates on two axes',
);
for (const subject of ['car', 'driver', 'car']) {
  let previous = result.selection[subject];
  const start = state.previous;
  for (let frame = 1; frame <= 30; frame++) {
    result = advanceSceneMotion(state, { ...input, now: start + (frame * 1000) / 60, subject });
    assert.ok(result.selection[subject] >= previous, 'selection illumination brightens monotonically');
    previous = result.selection[subject];
    for (const transform of Object.values(result.matrices)) {
      assert.ok(Array.from(transform).every(Number.isFinite));
      for (const offset of [0, 4, 8])
        assert.ok(
          Math.abs(Math.hypot(...transform.slice(offset, offset + 3)) - 1) < 1e-6,
          'rotation preserves model proportions and the hand-to-wheel fit',
        );
    }
  }
  result = advanceSceneMotion(state, { ...input, now: start + 550, subject });
  assert.ok(distance(result.matrices[subject]) < 0.000001, 'either selected model reaches its canonical pose within 550 milliseconds');
  assert.ok(result.selection[subject] > 0.99, 'the selected lighting is fully visible by alignment');
}
// A long-running rotation still returns on the shortest arc, without unwinding accumulated revolutions.
for (let frame = 0; frame < 3600; frame++) result = advanceSceneMotion(state, { ...input, now: state.previous + 1000 / 30 });
const start = state.previous;
let previousDistance = Infinity;
for (let frame = 1; frame <= 34; frame++) {
  result = advanceSceneMotion(state, { ...input, subject: 'car', now: start + (frame * 1000) / 60 });
  const current = distance(result.matrices.car);
  assert.ok(current <= previousDistance + 1e-6, 'alignment takes a direct path even after many revolutions');
  previousDistance = current;
}
assert.ok(previousDistance < 1e-6);
for (let frame = 0; frame < 120; frame++) {
  result = advanceSceneMotion(state, { ...input, subject: frame % 7 < 3 ? 'car' : 'driver', now: state.previous + 1000 / 60 });
  assert.ok(
    Object.values(result.selection).every((value) => value >= 0 && value <= 1),
    'interrupted transitions retain bounded lighting',
  );
  assert.ok(Object.values(result.matrices).every((transform) => Array.from(transform).every(Number.isFinite)));
}
const still = createSceneMotion();
const firstStill = advanceSceneMotion(still, { ...input, reducedMotion: true });
const laterStill = advanceSceneMotion(still, { ...input, now: 10000, reducedMotion: true });
assert.deepEqual(laterStill.matrices, firstStill.matrices, 'reduced motion disables all continuous rotation');
const changedStill = advanceSceneMotion(still, { ...input, subject: 'car', now: 11000, reducedMotion: true });
assert.equal(changedStill.selection.car, 1, 'reduced motion keeps immediate selection feedback');
assert.equal(distance(changedStill.matrices.car), 0);
const resumedStill = advanceSceneMotion(still, { ...input, subject: 'car', now: 11016 });
assert.equal(distance(resumedStill.matrices.car), 0, 'restoring animation never moves the selected model out of its settled pose');

const originalFetch = globalThis.fetch;
const footprints = [];
for (const subject of ['driver', 'car']) {
  const bytes = await readFile(new URL(`../site/assets/models/racing-${subject}.glb`, import.meta.url));
  let model;
  try {
    globalThis.fetch = async () => new Response(bytes);
    model = await loadStageModel('model.glb');
  } finally {
    globalThis.fetch = originalFetch;
  }
  const sample = Array.from(model.parts[0].vertices.slice(3, 8));
  normalizeStageModel(model, { azimuth: -0.68, elevation: 0.24 });
  let radius = 0;
  for (const part of model.parts)
    for (let index = 0; index < part.vertices.length; index += 8)
      radius = Math.max(radius, Math.hypot(...part.vertices.slice(index, index + 3)));
  assert.ok(radius <= 1.001, `${subject}: the entire rotating model fits its display`);
  const minimum = [Infinity, Infinity],
    maximum = [-Infinity, -Infinity];
  const right = [Math.cos(-0.68), 0, -Math.sin(-0.68)];
  const up = [-Math.sin(-0.68) * Math.sin(0.24), Math.cos(0.24), -Math.cos(-0.68) * Math.sin(0.24)];
  for (const part of model.parts)
    for (let index = 0; index < part.vertices.length; index += 8)
      for (const [axis, basis] of [right, up].entries()) {
        const coordinate = basis.reduce((sum, value, component) => sum + value * part.vertices[index + component], 0);
        minimum[axis] = Math.min(minimum[axis], coordinate);
        maximum[axis] = Math.max(maximum[axis], coordinate);
      }
  footprints.push((maximum[0] - minimum[0]) * (maximum[1] - minimum[1]));
  assert.deepEqual(
    Array.from(model.parts[0].vertices.slice(3, 8)),
    sample,
    'normalization preserves surface normals and texture coordinates',
  );
  const matrix = result.matrices[subject];
  for (const part of model.parts)
    for (let index = 0; index < part.vertices.length; index += 800)
      assert.ok(
        Math.hypot(...transformModelPoint(part.vertices.slice(index, index + 3), matrix)) < 1.000001,
        'rotation stays inside the viewport at every orientation',
      );
}
assert.ok(
  Math.abs(footprints[0] / footprints[1] - 1) < 0.001,
  'the driver and car have the same visible footprint in their presentation poses',
);
console.log(
  'PASS model display: equal sizes, independent two-axis rotation, 550 ms alignment, interrupted selection, rigid grip and reduced motion',
);
