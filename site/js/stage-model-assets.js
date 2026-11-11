// Read the baked, self-contained GLBs produced by tools/build-stage-scene.py.
// The authoring pipeline applies transforms and provides compact camera bounds.
export async function loadStageModel(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`Could not load the 3D model (${response.status})`);
  const buffer = await response.arrayBuffer();
  const header = new DataView(buffer);
  const jsonLength = header.getUint32(12, true);
  const document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const binaryOffset = 20 + jsonLength + 8;
  const data = new DataView(buffer, binaryOffset);
  const copyVector = (accessorIndex, index, target, targetOffset, size = 3) => {
    if (accessorIndex === undefined) return;
    const accessor = document.accessors[accessorIndex];
    const view = document.bufferViews[accessor.bufferView];
    const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0) + index * (view.byteStride || size * 4);
    for (let axis = 0; axis < size; axis++) target[targetOffset + axis] = data.getFloat32(offset + axis * 4, true);
  };
  const images = (document.images || []).map((image) => {
    const view = document.bufferViews[image.bufferView];
    return { bytes: new Uint8Array(buffer, binaryOffset + (view.byteOffset || 0), view.byteLength), type: image.mimeType };
  });
  const texture = (specification) => (specification ? images[document.textures[specification.index].source] : null);
  const parts = [];
  for (const mesh of document.meshes)
    for (const primitive of mesh.primitives) {
      const positions = document.accessors[primitive.attributes.POSITION];
      const indices = primitive.indices === undefined ? null : document.accessors[primitive.indices];
      const view = indices && document.bufferViews[indices.bufferView];
      const count = indices ? indices.count : positions.count;
      const vertices = new Float32Array(count * 8);
      for (let index = 0; index < count; index++) {
        let vertex = index;
        if (indices) {
          const offset = (view.byteOffset || 0) + (indices.byteOffset || 0);
          vertex = indices.componentType === 5125 ? data.getUint32(offset + index * 4, true) : data.getUint16(offset + index * 2, true);
        }
        copyVector(primitive.attributes.POSITION, vertex, vertices, index * 8);
        copyVector(primitive.attributes.NORMAL, vertex, vertices, index * 8 + 3);
        copyVector(primitive.attributes.TEXCOORD_0, vertex, vertices, index * 8 + 6, 2);
      }
      const specification = document.materials[primitive.material];
      const material = specification.pbrMetallicRoughness;
      parts.push({
        name: mesh.name,
        vertices,
        material: {
          name: specification.name,
          color: (material.baseColorFactor || [1, 1, 1, 1]).slice(0, 3),
          metal: material.metallicFactor ?? 1,
          roughness: material.roughnessFactor ?? 1,
          detail: specification.extras?.detail || 0,
          baseTexture: texture(material.baseColorTexture),
          normalTexture: texture(specification.normalTexture),
          normalScale: specification.normalTexture?.scale ?? 1,
        },
      });
    }
  return { parts, points: document.asset.extras.projectionPoints };
}

/** Match the visible footprint in the presentation pose, rather than the 3D radius.
 * Uniform scaling preserves source proportions, surface detail and the driver's grip. */
export function normalizeStageModel(asset, camera) {
  const minimum = [Infinity, Infinity, Infinity],
    maximum = [-Infinity, -Infinity, -Infinity];
  for (const { vertices } of asset.parts)
    for (let index = 0; index < vertices.length; index += 8)
      for (let axis = 0; axis < 3; axis++) {
        minimum[axis] = Math.min(minimum[axis], vertices[index + axis]);
        maximum[axis] = Math.max(maximum[axis], vertices[index + axis]);
      }
  const center = minimum.map((value, axis) => (value + maximum[axis]) / 2);
  const { azimuth, elevation } = camera;
  const right = [Math.cos(azimuth), 0, -Math.sin(azimuth)];
  const up = [-Math.sin(azimuth) * Math.sin(elevation), Math.cos(elevation), -Math.cos(azimuth) * Math.sin(elevation)];
  const projectedMinimum = [Infinity, Infinity],
    projectedMaximum = [-Infinity, -Infinity];
  for (const { vertices } of asset.parts)
    for (let index = 0; index < vertices.length; index += 8)
      for (const [axis, basis] of [right, up].entries()) {
        const coordinate = basis.reduce((sum, value, component) => sum + value * (vertices[index + component] - center[component]), 0);
        projectedMinimum[axis] = Math.min(projectedMinimum[axis], coordinate);
        projectedMaximum[axis] = Math.max(projectedMaximum[axis], coordinate);
      }
  const scale = Math.sqrt(1.28 / ((projectedMaximum[0] - projectedMinimum[0]) * (projectedMaximum[1] - projectedMinimum[1])));
  const point = (values) => values.map((value, axis) => (value - center[axis]) * scale);
  for (const { vertices } of asset.parts)
    for (let index = 0; index < vertices.length; index += 8) vertices.set(point(Array.from(vertices.slice(index, index + 3))), index);
  asset.points = asset.points.map(point);
  return asset;
}
