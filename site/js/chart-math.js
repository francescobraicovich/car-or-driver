// Pure chart maths: no DOM, so it can be tested in Node.

/** Round tick values covering [lo, hi]: 950 / 975 / 1000 rather than 944.3 / 958.6. */
export function niceTicks(lo, hi, target = 5) {
  if (!(hi > lo)) {
    const pad = Math.abs(lo) * 0.05 || 1;
    lo -= pad;
    hi += pad;
  }
  const rough = (hi - lo) / Math.max(1, target);
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const first = Math.floor(lo / step) * step;
  const last = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = first; v <= last + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return { ticks, lo: ticks[0], hi: ticks[ticks.length - 1], step };
}

/** Number of decimals needed to print ticks that are `step` apart. */
export function decimalsFor(step) {
  if (!(step > 0) || step >= 1) return 0;
  return Math.min(4, Math.ceil(-Math.log10(step) - 1e-9));
}

const YEAR = Date.UTC(2001, 0, 1) - Date.UTC(2000, 0, 1);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Date ticks for a time axis. Spans over ~2.5 years get year ticks
 * (every 1, 2, 5, 10 years as needed); shorter spans get month ticks.
 * Returns [{ t, label }] with every t inside [t0, t1].
 */
export function timeTicks(t0, t1, maxTicks = 8) {
  const span = t1 - t0;
  const out = [];
  if (!(span > 0)) return out;
  if (span > 2.5 * YEAR) {
    const years = span / YEAR;
    const step = [1, 2, 5, 10, 20].find((s) => years / s <= maxTicks) ?? 20;
    const y0 = new Date(t0).getUTCFullYear();
    for (let y = Math.ceil((y0 + 1) / step) * step; Date.UTC(y, 0, 1) <= t1; y += step) {
      if (Date.UTC(y, 0, 1) >= t0) out.push({ t: Date.UTC(y, 0, 1), label: String(y) });
    }
    return out;
  }
  const months = span / (YEAR / 12);
  const step = [1, 2, 3, 6].find((s) => months / s <= maxTicks) ?? 6;
  const d0 = new Date(t0);
  let y = d0.getUTCFullYear();
  let m = Math.ceil((d0.getUTCMonth() + (d0.getUTCDate() > 1 ? 1 : 0)) / step) * step;
  for (;;) {
    y += Math.floor(m / 12);
    m %= 12;
    const t = Date.UTC(y, m, 1);
    if (t > t1) break;
    if (t >= t0) out.push({ t, label: m === 0 ? `${MONTHS[m]} ${y}` : MONTHS[m] });
    m += step;
  }
  return out;
}

/**
 * Spread labels vertically so none sit closer than `gap` px, inside [min, max],
 * each as near its anchor as possible (overlapping labels form a stack centred
 * on the mean of their anchors). Input [{ id, y }]; returns Map(id -> y).
 */
export function spreadLabels(items, gap, min, max) {
  const clusters = [];
  // `sum` holds the sum of (anchor - offset) so a stack's top is sum / n.
  const top = (c) => Math.min(Math.max(c.sum / c.n, min), Math.max(min, max - (c.n - 1) * gap));
  for (const it of [...items].sort((a, b) => a.y - b.y)) {
    clusters.push({ ids: [it.id], sum: it.y, n: 1 });
    while (clusters.length > 1) {
      const b = clusters[clusters.length - 1];
      const a = clusters[clusters.length - 2];
      if (top(b) >= top(a) + a.n * gap) break;
      a.sum += b.sum - b.n * a.n * gap; // b's labels continue a's stack
      a.ids.push(...b.ids);
      a.n += b.n;
      clusters.pop();
    }
  }
  const out = new Map();
  for (const c of clusters) c.ids.forEach((id, k) => out.set(id, top(c) + k * gap));
  return out;
}

/** Stable slot (0-7) for an entity when nothing better is known. */
export function slotFor(key, slots = 8) {
  let hash = 2166136261;
  for (const c of String(key)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  return hash % slots;
}

/**
 * Keep colours stable while a selection changes: an entity already holding a
 * slot keeps it, new entities take the lowest free slot, and a slot is freed
 * when its entity leaves the selection. `held` is mutated and returned.
 */
export function assignSlots(held, ids, slots = 8) {
  const keep = new Set(ids);
  for (const id of [...held.keys()]) if (!keep.has(id)) held.delete(id);
  const used = new Set(held.values());
  for (const id of ids) {
    if (held.has(id)) continue;
    let slot = 0;
    while (slot < slots && used.has(slot)) slot++;
    if (slot >= slots) slot = slotFor(id, slots); // more than 8 at once: share
    held.set(id, slot);
    used.add(slot);
  }
  return held;
}

/** Index of the value in a sorted array nearest to `x`. */
export function nearestIndex(sorted, x) {
  let lo = 0;
  let hi = sorted.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= x) lo = mid;
    else hi = mid;
  }
  return Math.abs(sorted[lo] - x) <= Math.abs(sorted[hi] - x) ? lo : hi;
}
