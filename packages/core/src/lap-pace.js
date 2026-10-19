// Representative race pace from lap times.
//
// For each (race, driver): median of laps within 105% of the driver's personal
// best (lap 1 excluded). This drops pit in/out laps, safety-car cruising and
// fuel-saving outliers without needing pit data.
//
// Window medians (8-lap windows of race lap number, same filter) enable
// like-for-like comparison: two drivers share a window only if both ran it,
// so fuel loads and track states roughly match. Stored inline per driver as
// `win: [{ s, med, n }]`.
//
// Result: Map(raceId -> Map(driverId -> { med, n, win })) — seconds, lap
// counts, and a handful of window medians. Compact enough to clone into the
// Web Worker on every rebuild.
const WINDOW = 8;

function median(sorted) {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

export function parseLapPace(text) {
  const per = new Map(); // raceId -> driverId -> [[lap, sec]]
  text = text.replace(/^\uFEFF/, '');
  const lines = text.split('\n');
  const h = lines[0].replace(/\r$/, '').split(',');
  const ir = h.indexOf('raceId');
  const id = h.indexOf('driverId');
  const il = h.indexOf('lap');
  const im = h.indexOf('milliseconds');
  if ([ir, id, il, im].some((x) => x < 0)) throw Error('lap_times.csv schema not recognised');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    if (!line) continue;
    const a = line.split(',');
    const lap = +a[il];
    if (lap <= 1) continue;
    const ms = +a[im];
    if (!Number.isFinite(ms) || ms <= 0) continue;
    const rid = a[ir];
    const drv = String(a[id]);
    let m1 = per.get(rid);
    if (!m1) {
      m1 = new Map();
      per.set(rid, m1);
    }
    let arr = m1.get(drv);
    if (!arr) {
      arr = [];
      m1.set(drv, arr);
    }
    arr.push([lap, ms / 1000]);
  }
  const out = new Map();
  for (const [rid, m1] of per) {
    const m2 = new Map();
    for (const [drv, laps] of m1) {
      const secs = laps.map((l) => l[1]).sort((x, y) => x - y);
      const lim = secs[0] * 1.05;
      const rep = secs.filter((t) => t <= lim);
      const byW = new Map();
      for (const [lap, t] of laps) {
        if (t > lim) continue;
        const w = Math.floor((lap - 2) / WINDOW);
        let e = byW.get(w);
        if (!e) {
          e = [];
          byW.set(w, e);
        }
        e.push(t);
      }
      const win = [];
      for (const [w, e] of [...byW.entries()].sort((a, b) => a[0] - b[0])) {
        e.sort((x, y) => x - y);
        win.push({ s: 2 + w * WINDOW, med: median(e), n: e.length });
      }
      m2.set(drv, { med: median(rep), n: rep.length, win });
    }
    out.set(rid, m2);
  }
  return out;
}

/** Like-for-like pace comparison of two window series.
 *  Returns { faster: 1|-1|0, gapSec, laps } over shared windows (both n>=2),
 *  or null when nothing overlaps. */
export function compareWindows(wx, wy) {
  const my = new Map(wy.map((w) => [w.s, w]));
  let num = 0;
  let den = 0;
  for (const a of wx) {
    const b = my.get(a.s);
    if (!b || a.n < 2 || b.n < 2) continue;
    const w = Math.min(a.n, b.n);
    num += (b.med - a.med) * w;
    den += w;
  }
  if (den < 4) return null; // need a few shared representative laps
  const gap = num / den; // >0 means x faster (seconds/lap)
  if (Math.abs(gap) < 1e-9) return null;
  return { faster: gap > 0 ? 1 : -1, gapSec: Math.abs(gap), laps: den };
}
