// Small numeric/array helpers shared by the model and the site.
export const BASE = 1000; // every rating scale is centred here

export function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

export function pct(x) {
  return `${(100 * x).toFixed(1)}%`;
}

/** Last element (avoids Array.prototype.at for older Safari). */
export function last(a) {
  return a[a.length - 1];
}

/** Win probability for a rating gap, on a scale of `scale` points per factor 10 in odds (75 on the site; 400 is the classic Elo). */
export function gapToP(diff, scale = 400) {
  return 1 / (1 + 10 ** (-diff / scale));
}

/** The rating (centred on BASE) at which a win probability p holds against a BASE-rated opponent. */
export function pToRating(p, scale = 400) {
  p = clamp(p, 1e-6, 1 - 1e-6);
  return BASE + scale * Math.log10(p / (1 - p));
}

/** Weighted blend of race and qualifying ratings (falls back to race). */
export function combineRating(race, qual, seen, qw, on) {
  const w = on && seen > 0 ? clamp(qw, 0, 1) : 0;
  return BASE + (1 - w) * (race - BASE) + w * (qual - BASE);
}
