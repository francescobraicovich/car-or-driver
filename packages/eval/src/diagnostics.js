// Statistical health of the ratings as a stream: are the updates unpredictable, and are the error bars the right size?
//
//   efficiency   a rating that has absorbed what the results say should not be revised in a predictable direction:
//                the next revision should be uncorrelated with the last one (slope 0). Positive = the filter reacts too
//                slowly, negative = it chases noise. Within a season and a team only (winters and moves are known jumps).
//   uncertainty  for a Bayesian filter the revision over k weekends has variance (sd before + process noise - sd after);
//                the average squared standardised revision should be about 1. Above 1 = bars too narrow.
//   widening     the error bars must grow where the model knows less: after a move, a debut, a regulation winter.
import { clusterBootstrap, mean, median, olsOrigin } from './stats.js';
import { REGULATION_YEARS, driverPost, makeControls } from './events.js';

const byYear = (it) => it.year;

function efficiency(idx, run, controls, { minPrior = 20 } = {}) {
  const items = { driver: [], car: [] };
  for (const [d, apps] of idx.appear) {
    const u = []; // net revisions between consecutive appearances, with the year and whether a clean in-team step
    for (let j = 1; j < apps.length; j++) {
      const clean = apps[j].team === apps[j - 1].team && idx.year(apps[j].i) === idx.year(apps[j - 1].i) && j >= minPrior;
      const ctl = clean ? controls.drivers(apps[j - 1].i, apps[j].i) : null;
      const a = driverPost(run, apps[j - 1].i, d);
      const b = driverPost(run, apps[j].i, d);
      u.push(ctl && Number.isFinite(a) && Number.isFinite(b) ? { year: idx.year(apps[j].i), v: b - a - ctl.mean } : null);
    }
    for (let j = 0; j + 1 < u.length; j++) if (u[j] && u[j + 1]) items.driver.push({ year: u[j].year, a: u[j].v, b: u[j + 1].v });
  }
  for (const [car, weeks] of idx.carWeeks) {
    const u = [];
    for (let j = 1; j < weeks.length; j++) {
      const i0 = weeks[j - 1];
      const i1 = weeks[j];
      const clean = idx.year(i0) === idx.year(i1) && idx.carLineup[i0].get(car).join() === idx.carLineup[i1].get(car).join();
      const ctl = clean ? controls.cars(i0, i1) : null;
      const a = run.post[i0].cars.get(idx.carCid[i0].get(car))?.m;
      const b = run.post[i1].cars.get(idx.carCid[i1].get(car))?.m;
      u.push(ctl && Number.isFinite(a) && Number.isFinite(b) ? { year: idx.year(i1), v: b - a - ctl.mean } : null);
    }
    for (let j = 0; j + 1 < u.length; j++) if (u[j] && u[j + 1]) items.car.push({ year: u[j].year, a: u[j].v, b: u[j + 1].v });
  }
  return items;
}

function uncertainty(idx, run, { K = 6 } = {}) {
  if (!run.drift) return null;
  const out = { driver: [], car: [] };
  const years = [...new Set(idx.timeline.map((w) => w.year))];
  for (const y of years) {
    const wk = idx.timeline.filter((w) => w.year === y).map((w) => w.i);
    for (let a = 0; a + K < wk.length; a += K) {
      const i0 = wk[a];
      const i1 = wk[a + K];
      const same = (x, z) => x.size === z.size && [...x.keys()].every((k) => z.has(k));
      if (!same(idx.teamAt[i0], idx.teamAt[i1])) continue;
      for (const [d, t] of idx.teamAt[i0]) {
        if (idx.teamAt[i1].get(d) !== t || idx.tenure[i0].get(d) < 10) continue;
        const r0 = run.post[i0].drivers.get(d);
        const r1 = run.post[i1].drivers.get(d);
        if (!r0?.seen || !r1?.seen || !Number.isFinite(r0.sd)) continue;
        const v = r0.sd ** 2 + K * run.drift.driver - r1.sd ** 2;
        if (v > 0.25) out.driver.push({ year: y, z: (r1.m - r0.m) / Math.sqrt(v) });
      }
      for (const [car, l0] of idx.carLineup[i0]) {
        const l1 = idx.carLineup[i1].get(car);
        if (!l1 || l1.join() !== l0.join()) continue;
        const r0 = run.post[i0].cars.get(idx.carCid[i0].get(car));
        const r1 = run.post[i1].cars.get(idx.carCid[i1].get(car));
        if (!r0 || !r1 || !Number.isFinite(r0.sd)) continue;
        const v = r0.sd ** 2 + K * run.drift.car - r1.sd ** 2;
        if (v > 0.25) out.car.push({ year: y, z: (r1.m - r0.m) / Math.sqrt(v) });
      }
    }
  }
  return out;
}

/** Posterior sd after an event against the median sd of drivers (cars) of that weekend: > 1 means the model widened. */
function widening(idx, run, moves, rookies, regYears) {
  if (!run.post.some((p) => [...p.drivers.values()].some((d) => Number.isFinite(d.sd)))) return null;
  const sdRatio = (i, id, kind, minTenure = 10) => {
    const r = run.post[i][kind].get(id);
    if (!r || !Number.isFinite(r.sd)) return NaN;
    const ref = [...run.post[i][kind]]
      .filter(([k, v]) => k !== id && Number.isFinite(v.sd) && (kind === 'cars' || (idx.tenure[i].get(k) ?? 0) >= minTenure))
      .map(([, v]) => v.sd);
    return ref.length >= 4 ? r.sd / median(ref) : NaN;
  };
  const items = {
    mover: moves.filter((m) => m.valid).map((m) => ({ year: m.year, v: sdRatio(m.t0, m.driverId, 'drivers') })),
    rookie: rookies.map((r) => ({ year: r.year, v: sdRatio(r.t0, r.driverId, 'drivers') })),
    carRegYear: [],
  };
  for (const [car, weeks] of idx.carWeeks) {
    const firsts = weeks.filter((i, j) => j === 0 || idx.year(weeks[j - 1]) !== idx.year(i));
    for (const i of firsts) {
      if (!regYears.includes(idx.year(i)) || i === weeks[0]) continue;
      const cid = idx.carCid[i].get(car);
      items.carRegYear.push({ year: idx.year(i), v: sdRatio(i, cid, 'cars') });
    }
  }
  for (const k of Object.keys(items)) items[k] = items[k].filter((x) => Number.isFinite(x.v));
  return items;
}

export function diagnosticMetrics(idx, run, { moves, rookies, regYears = REGULATION_YEARS, boot = {} }) {
  const controls = makeControls(idx, run);
  const pre = `health.${run.session}`;
  const H = {};
  const out = { headline: H };

  const eff = efficiency(idx, run, controls);
  const slope = (xs) =>
    olsOrigin(
      xs.map((x) => x.a),
      xs.map((x) => x.b),
    );
  out.efficiency = { driver: clusterBootstrap(eff.driver, byYear, slope, boot), car: clusterBootstrap(eff.car, byYear, slope, boot) };
  H[`${pre}.efficiency.driver`] = out.efficiency.driver;
  H[`${pre}.efficiency.car`] = out.efficiency.car;

  const unc = uncertainty(idx, run);
  if (unc) {
    out.uncertainty = {};
    for (const kind of ['driver', 'car']) {
      const z2 = clusterBootstrap(unc[kind], byYear, (xs) => mean(xs.map((x) => x.z ** 2)), boot);
      const cover = clusterBootstrap(unc[kind], byYear, (xs) => mean(xs.map((x) => +(Math.abs(x.z) < 1.645))), boot);
      out.uncertainty[kind] = { z2, cover90: cover };
      H[`${pre}.uncertainty.${kind}.z2`] = z2;
      H[`${pre}.uncertainty.${kind}.cover90`] = cover;
    }
  }

  const wid = widening(idx, run, moves, rookies, regYears);
  if (wid) {
    out.widening = {};
    for (const [k, items] of Object.entries(wid)) {
      out.widening[k] = clusterBootstrap(items, byYear, (xs) => mean(xs.map((x) => x.v)), boot);
      H[`${pre}.widening.${k}`] = out.widening[k];
    }
  }
  return out;
}
