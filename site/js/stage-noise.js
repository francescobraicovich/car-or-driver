// Smooth, repeatable noise for the cursor and the box: the same inputs always give the same output, so the movement can be tested and replayed.
// Value noise on an integer lattice with smooth interpolation; results are in [-1, 1].

function lattice(index, seed) {
  let h = (Math.imul(index | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Smooth noise at position `t`; one unit of `t` is one lattice step, so a larger factor in the caller means faster wobble. */
export function smoothNoise(t, seed = 0) {
  const base = Math.floor(t);
  const fraction = smooth(t - base);
  return lattice(base, seed) * (1 - fraction) + lattice(base + 1, seed) * fraction;
}

/** Quick, small shakes: noise at a high rate. */
export const shake = (seconds, seed, rate = 18) => smoothNoise(seconds * rate, seed);

/** Slow drifts: noise at a low rate. */
export const sway = (seconds, seed, rate = 0.9) => smoothNoise(seconds * rate, seed);
