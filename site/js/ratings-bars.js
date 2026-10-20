// The bar beside each rating in the ratings panel, made of block characters: pure, so that it is tested in Node (tests/test-stage.mjs).

/** The bar for a rating among the ratings shown: the lowest gets one block, the highest all of them. `width` is the number of characters. */
export function bar(value, low, high, width) {
  if (!Number.isFinite(value) || high <= low) return '░'.repeat(width);
  const filled = 1 + Math.round(((value - low) / (high - low)) * (width - 1));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** The lowest and highest end of the scale for these values: the lowest rating still gets a visible bar. */
export function barScale(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { low: 0, high: 0 };
  const high = Math.max(...finite);
  const lowest = Math.min(...finite);
  return { low: lowest - 0.15 * (high - lowest || 1), high };
}
