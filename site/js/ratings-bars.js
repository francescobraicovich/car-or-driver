// The bar beside each rating in the ratings panel: where a value falls on the scale of the values shown, as a share of the bar's width. Pure, so that
// it is tested in Node (tests/test-stage.mjs).

/** The share (0 to 1) of the bar that a value fills, on a scale from `low` to `high`. */
export function barShare(value, low, high) {
  if (!Number.isFinite(value) || high <= low) return 0;
  return Math.min(1, Math.max(0, (value - low) / (high - low)));
}

/** The lowest and highest end of the scale for these values: the lowest of them still gets a visible bar. */
export function barScale(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { low: 0, high: 0 };
  const high = Math.max(...finite);
  const lowest = Math.min(...finite);
  return { low: lowest - 0.15 * (high - lowest || 1), high };
}
