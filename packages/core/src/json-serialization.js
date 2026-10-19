// Turns a built model into JSON text and back, so the ratings can be computed once, when the site is published, and every visitor downloads the
// result instead of recomputing it. JSON has no Map, Set, typed array, NaN, Infinity or undefined, so each is written as a one-key tagged object.
// Non-integer numbers are kept to 9 significant digits (a relative change below 1e-9, a third smaller on the wire); integers are exact.
// tests/test-model-file.mjs checks that what a visitor sees is unchanged.

const TAG = '$';
const SIGNIFICANT_DIGITS = 9;

function encode(value) {
  if (value === undefined) return { [TAG]: 'undefined' };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { [TAG]: String(value) }; // 'NaN', 'Infinity', '-Infinity'
    return Number.isInteger(value) ? value : Number(value.toPrecision(SIGNIFICANT_DIGITS));
  }
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'bigint' || typeof value === 'symbol')
      throw new TypeError(`cannot serialize a ${typeof value}`);
    return value;
  }
  if (Array.isArray(value)) return value.map(encode);
  if (value instanceof Map) return { [TAG]: 'Map', entries: [...value].map(([k, v]) => [encode(k), encode(v)]) };
  if (value instanceof Set) return { [TAG]: 'Set', values: [...value].map(encode) };
  if (ArrayBuffer.isView(value)) return { [TAG]: value.constructor.name, values: Array.from(value, encode) };
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TypeError(`cannot serialize an instance of ${value.constructor?.name}`);
  }
  if (TAG in value) throw new TypeError(`an object may not use the reserved key "${TAG}"`);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
}

const TYPED_ARRAYS = { Float64Array, Float32Array, Int32Array, Int16Array, Int8Array, Uint32Array, Uint16Array, Uint8Array };

function decode(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decode);
  const tag = value[TAG];
  if (tag === undefined) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
  if (tag === 'undefined') return undefined;
  if (tag === 'NaN') return NaN;
  if (tag === 'Infinity') return Infinity;
  if (tag === '-Infinity') return -Infinity;
  if (tag === 'Map') return new Map(value.entries.map(([k, v]) => [decode(k), decode(v)]));
  if (tag === 'Set') return new Set(value.values.map(decode));
  if (TYPED_ARRAYS[tag]) return TYPED_ARRAYS[tag].from(value.values.map(decode));
  throw new TypeError(`unknown tag "${tag}"`);
}

export const serialize = (value) => JSON.stringify(encode(value));
export const deserialize = (text) => decode(JSON.parse(text));
