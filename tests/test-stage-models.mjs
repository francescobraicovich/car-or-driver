// Validate the supplied-model exports, retained detail, provenance, and actual browser GLB reader.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { loadStageModel } from '../site/js/stage-model-assets.js';

const sourceFiles = [
  'tools/build-stage-models.mjs',
  'tools/build-stage-scene.py',
  'tools/read-stage-driver.c',
  'site/assets/f1-mercedes-car/source/F12022_bodytest.fbx',
  'site/assets/f1-driver/source/rhp_bell_hp77_driver_f1.7z',
  'site/assets/f1-driver/textures/2025_driver_suit_diff.png',
  'site/assets/f1-driver/textures/2025_driver_suit_nm.png',
];
const fingerprint = createHash('sha256');
for (const file of sourceFiles) fingerprint.update(await readFile(new URL(`../${file}`, import.meta.url)));
const sourceHash = fingerprint.digest('hex');
let webBytes = 0;
for (const [name, file] of [
  ['Car', 'racing-car.glb'],
  ['Driver', 'racing-driver.glb'],
]) {
  const binary = await readFile(new URL(`../site/assets/models/${file}`, import.meta.url));
  webBytes += binary.length;
  assert.equal(binary.readUInt32LE(0), 0x46546c67);
  assert.equal(binary.readUInt32LE(4), 2);
  assert.equal(binary.readUInt32LE(8), binary.length);
  const jsonLength = binary.readUInt32LE(12);
  assert.equal(jsonLength % 4, 0);
  const document = JSON.parse(binary.subarray(20, 20 + jsonLength).toString());
  assert.equal(document.asset.extras.sourceHash, sourceHash, `${name}: Blender export matches its current sources`);
  assert.match(document.asset.extras.authoring, /Blender 5\./);
  assert.ok(document.asset.extras.projectionPoints.length >= 12);
  assert.ok(!document.buffers[0].uri, 'self-contained binary');
  for (const node of document.nodes) {
    assert.ok(!node.translation || node.translation.every((value) => Math.abs(value) < 0.00001));
    assert.ok(!node.rotation || node.rotation.every((value, index) => Math.abs(value - (index === 3 ? 1 : 0)) < 0.00001));
    assert.ok(!node.scale || node.scale.every((value) => Math.abs(value - 1) < 0.00001));
  }
  const originalFetch = globalThis.fetch;
  let model;
  try {
    globalThis.fetch = async () => new Response(binary);
    model = await loadStageModel('model.glb');
  } finally {
    globalThis.fetch = originalFetch;
  }
  let triangles = 0,
    fabricTriangles = 0;
  const minimum = [Infinity, Infinity, Infinity],
    maximum = [-Infinity, -Infinity, -Infinity];
  for (const part of model.parts) {
    assert.ok(part.material.color.every(Number.isFinite), `${name}: base colour factors have glTF defaults`);
    assert.ok(
      Number.isFinite(part.material.metal) && Number.isFinite(part.material.roughness),
      `${name}: metallic and roughness factors have glTF defaults`,
    );
    triangles += part.vertices.length / 24;
    for (let index = 0; index < part.vertices.length; index += 8) {
      assert.ok(Array.from(part.vertices.subarray(index, index + 8)).every(Number.isFinite), `${name}: finite browser vertices`);
      const length = Math.hypot(...part.vertices.subarray(index + 3, index + 6));
      assert.ok(Math.abs(length - 1) < 0.001, `${name}: Blender normals survive the browser reader`);
      for (let axis = 0; axis < 3; axis++) {
        minimum[axis] = Math.min(minimum[axis], part.vertices[index + axis]);
        maximum[axis] = Math.max(maximum[axis], part.vertices[index + axis]);
      }
    }
  }
  for (const mesh of document.meshes)
    for (const primitive of mesh.primitives)
      if (document.materials[primitive.material].name === 'Silver technical fabric')
        fabricTriangles += document.accessors[primitive.indices].count / 3;
  assert.ok(triangles > 20000);
  assert.ok(triangles < document.asset.extras.sourceTriangles[name.toLowerCase()], `${name}: imported geometry has been reduced`);
  assert.equal(document.asset.extras.sourceModels[0].author, 'Nick Broad');
  assert.equal(document.asset.extras.sourceModels[1].author, 'MattDoesBlender');
  assert.equal(document.asset.extras.sourceModels[1].license, 'CC BY-NC-SA 4.0');
  assert.ok(model.parts.length <= 16, `${name}: material batches limit draw calls`);
  assert.ok(binary.length < 2200000, `${name}: web model budget`);
  if (name === 'Driver') {
    assert.ok(fabricTriangles > 10000, 'the continuous suited body is preserved');
    assert.ok(minimum[1] > 1.15 && maximum[1] > 2.3, 'the complete seated driver levitates above the cockpit');
    assert.ok(minimum[0] < -0.8 && maximum[0] > 0.05, 'the supplied seated silhouette extends its legs forward from the torso');
    const fabric = model.parts.find((part) => part.material.baseTexture);
    assert.ok(fabric?.material.normalTexture, 'the supplied suit retains its seams and cloth normal map');
    assert.equal(fabric.material.baseTexture.type, 'image/jpeg');
    assert.equal(fabric.material.normalTexture.type, 'image/png');
    assert.equal(document.images.length, 2, 'only cleaned, resized suit maps are embedded');
    const wheel = [];
    for (const part of model.parts) {
      if (!['Graphite equipment', 'Woven carbon'].includes(part.material.name)) continue;
      for (let index = 0; index < part.vertices.length; index += 8) {
        const point = part.vertices.subarray(index, index + 3);
        if (point[0] < -0.4 && point[1] > 1.65 && point[1] < 2.15) wheel.push(point);
      }
    }
    const wheelExtent = (axis) => Math.max(...wheel.map((point) => point[axis])) - Math.min(...wheel.map((point) => point[axis]));
    const wheelCenter = (axis) => (Math.max(...wheel.map((point) => point[axis])) + Math.min(...wheel.map((point) => point[axis]))) / 2;
    assert.ok(Math.abs(wheelExtent(2) - 0.28) < 0.005, `the F1 steering wheel is 28 cm wide, measured ${wheelExtent(2).toFixed(3)} m`);
    assert.ok(wheelExtent(1) > 0.15 && wheelExtent(1) < 0.19, 'the wheel height retains its source proportions');
    const wheelCenterX = wheelCenter(0);
    for (const side of [-1, 1]) {
      const palm = [],
        grip = wheel.filter((point) => point[2] * side > 0.08);
      for (const part of model.parts)
        for (let index = 0; index < part.vertices.length; index += 8) {
          const point = part.vertices.subarray(index, index + 3);
          if (point[2] * side < 0.04) continue;
          if (part.material.name === 'Graphite driving gloves' && point[0] > wheelCenterX + 0.02 && point[0] < wheelCenterX + 0.09)
            palm.push(point);
        }
      const extent = (axis) => Math.max(...palm.map((point) => point[axis])) - Math.min(...palm.map((point) => point[axis]));
      assert.ok(extent(1) > extent(2) * 1.35, 'both palms face the vertical wheel grips');
      let clearance = Infinity;
      for (const hand of palm)
        for (const wheel of grip) clearance = Math.min(clearance, Math.hypot(...hand.map((value, axis) => value - wheel[axis])));
      assert.ok(clearance < 0.012, 'both gloved palms contact the actual steering-wheel mesh');
    }
  }
  console.log(
    `PASS ${name}: ${triangles.toLocaleString('en-GB')} optimized source triangles, source fingerprint, browser reader and material batches`,
  );
}
assert.ok(webBytes < 3600000, 'both runtime models fit the combined download budget');
const combined = await readFile(new URL('../site/assets/models/car-and-driver.glb', import.meta.url));
const scene = JSON.parse(combined.subarray(20, 20 + combined.readUInt32LE(12)).toString());
assert.equal(scene.nodes.filter((node) => node.mesh !== undefined).length, 2, 'combined export contains aligned car and driver actors');
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response('', { status: 404 });
  await assert.rejects(loadStageModel('missing.glb'), /Could not load/, 'missing model assets fail clearly');
} finally {
  globalThis.fetch = originalFetch;
}
