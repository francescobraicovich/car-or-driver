// A portable signature for every long-term rating value. Hash structure exactly,
// then compare short numeric chunks with tolerance rather than rounding hashes.
import { createHash } from 'node:crypto';

export const CHUNK_SIZE = 256;
export const RELATIVE_TOLERANCE = 1e-9;

export function ratingSignature(value) {
  const shape = createHash('sha256');
  const chunks = [];
  let count = 0;
  let chunk = [0, 0, 0, 0, 0]; // magnitude, squares, signed, weighted signed, weighted magnitude
  const addShape = (type, content = '') => {
    const text = String(content);
    shape.update(`${type}${text.length}:${text};`);
  };
  const visit = (item) => {
    if (typeof item === 'number' && Number.isFinite(item)) {
      const weight = (count % CHUNK_SIZE) + 1;
      const absolute = Math.abs(item);
      chunk[0] += absolute;
      chunk[1] += item * item;
      chunk[2] += item;
      chunk[3] += weight * item;
      chunk[4] += weight * absolute;
      count++;
      addShape('n');
      if (count % CHUNK_SIZE === 0) {
        chunks.push(chunk);
        chunk = [0, 0, 0, 0, 0];
      }
    } else if (Array.isArray(item) || ArrayBuffer.isView(item)) {
      addShape('a', item.length);
      for (const child of item) visit(child);
    } else if (item instanceof Map) {
      addShape('m', item.size);
      for (const [key, child] of item) {
        visit(key);
        visit(child);
      }
    } else if (item && typeof item === 'object') {
      const keys = Object.keys(item).sort();
      addShape('o', keys.length);
      for (const key of keys) {
        addShape('k', key);
        visit(item[key]);
      }
    } else {
      addShape(typeof item, String(item));
    }
  };
  visit(value);
  if (count % CHUNK_SIZE) chunks.push(chunk);
  return { shape: shape.digest('hex'), count, chunkSize: CHUNK_SIZE, chunks };
}

export function compareRatingSignatures(actual, expected) {
  if (
    actual.shape !== expected.shape ||
    actual.count !== expected.count ||
    actual.chunkSize !== expected.chunkSize ||
    actual.chunks.length !== expected.chunks.length
  )
    return { equal: false, reason: 'rating structure or value count changed' };
  for (let i = 0; i < expected.chunks.length; i++) {
    const actualChunk = actual.chunks[i];
    const reference = expected.chunks[i];
    if (actualChunk.length !== 5 || reference.length !== 5) return { equal: false, reason: `invalid chunk ${i}` };
    const scales = [reference[0], reference[1], reference[0], reference[4], reference[4]];
    for (let j = 0; j < scales.length; j++) {
      if (
        !Number.isFinite(actualChunk[j]) ||
        !Number.isFinite(reference[j]) ||
        Math.abs(actualChunk[j] - reference[j]) > RELATIVE_TOLERANCE * Math.max(1, scales[j])
      )
        return { equal: false, reason: `numeric chunk ${i}, statistic ${j} changed` };
    }
  }
  return { equal: true };
}
