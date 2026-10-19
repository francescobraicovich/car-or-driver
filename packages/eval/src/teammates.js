// Property 2: the teammate who stays does not see his rating move because a new driver arrives.
//
// For every lineup change of a team that keeps at least one driver and takes in established drivers, we follow the
// drivers who stayed and look at
//   step   the change of their rating over the first k weekends of the new lineup, net of stable drivers (the mean is
//          the bias, its size against the stable drivers is the excess movement);
//   leak   the slope of that step on how much stronger the incoming driver is than the one he replaced (and than the
//          stayer himself): a calibrated rating does not move with the newcomer's strength;
//   alloc  where the model puts a revision of the pair's gap: when the new pair performs differently from what the
//          ratings said, the revision has to land on the mover, the teammate or the car. Reported as three slopes on
//          the gap revision (mover - teammate = 1 by construction); the car's share should be small, because a gap
//          between two drivers of one car says nothing about the car.
import { clusterBootstrap, mean, ols, olsOrigin } from './stats.js';
import { carPost, driverPost, makeControls } from './events.js';

const byYear = (it) => it.year;
export const MATE_HORIZONS = [3, 5, 10];

export function teammateMetrics(idx, run, changes, { boot = {} } = {}) {
  const controls = makeControls(idx, run);
  const out = { n: changes.filter((c) => c.valid).length, step: {}, alloc: {}, headline: {} };
  const H = out.headline;
  const pre = `teammates.${run.session}`;
  for (const K of MATE_HORIZONS) {
    const items = [];
    const alloc = [];
    for (const ch of changes) {
      if (!ch.valid || ch.weeksAfter.length < K) continue;
      const tK = ch.weeksAfter[K - 1];
      const ctl = controls.drivers(ch.ellT, tK);
      if (!ctl) continue;
      const inc = ch.movers.map((m) => driverPost(run, m.ell, m.driverId));
      const out_ = ch.outgoing.map((d) => driverPost(run, ch.ellT, d)).filter(Number.isFinite);
      const xIn = inc.every(Number.isFinite) ? mean(inc) : NaN;
      const xRep = out_.length && Number.isFinite(xIn) ? xIn - mean(out_) : NaN;
      for (const s of ch.stayers) {
        if (!idx.lineup[tK].get(ch.team)?.includes(s)) continue;
        const a = driverPost(run, ch.ellT, s);
        const b = driverPost(run, tK, s);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        const incPre = mean(ch.movers.map((m) => run.pre[ch.t0].drivers.get(m.driverId)));
        items.push({
          year: ch.year,
          delta: b - a - ctl.mean,
          ctlRms: ctl.rms,
          xRep,
          xGap: incPre - run.pre[ch.t0].drivers.get(s),
        });
        // allocation: one mover, one stayer, same car before and after
        if (ch.movers.length === 1 && ch.stayers.length === 1) {
          const m = ch.movers[0];
          const carA = idx.carCid[ch.ellT]?.get(idx.carOf(idx.cidAt[ch.ellT].get(s)));
          const carB = idx.carCid[tK].get(idx.carOf(idx.cidAt[tK].get(s)));
          const cc = controls.cars(ch.ellT, tK);
          const mA = driverPost(run, m.ell, m.driverId);
          const mB = driverPost(run, tK, m.driverId);
          const cm = controls.drivers(m.ell, tK);
          if (cc && cm && carA !== undefined && idx.carOf(carA) === idx.carOf(carB) && [mA, mB].every(Number.isFinite)) {
            const dc = carPost(run, tK, carB) - carPost(run, ch.ellT, carA) - cc.mean;
            const dm = mB - mA - cm.mean;
            const ds = b - a - ctl.mean;
            if (Number.isFinite(dc)) alloc.push({ year: ch.year, gap: dm - ds, dm, ds, dc });
          }
        }
      }
    }
    const meanCI = clusterBootstrap(items, byYear, (xs) => mean(xs.map((x) => x.delta)), boot);
    const ratioCI = clusterBootstrap(
      items,
      byYear,
      (xs) => Math.sqrt(mean(xs.map((x) => x.delta ** 2))) / Math.sqrt(mean(xs.map((x) => x.ctlRms ** 2))),
      boot,
    );
    const slope = (key) => (xs) => {
      const f = xs.filter((x) => Number.isFinite(x[key]));
      return ols(
        f.map((x) => x[key]),
        f.map((x) => x.delta),
      ).b;
    };
    const leakRep = clusterBootstrap(
      items.filter((x) => Number.isFinite(x.xRep)),
      byYear,
      slope('xRep'),
      boot,
    );
    const leakGap = clusterBootstrap(items, byYear, slope('xGap'), boot);
    out.step[K] = { n: items.length, mean: meanCI, rmsRatio: ratioCI, leakVsReplaced: leakRep, leakVsGap: leakGap };
    H[`${pre}.step.k${K}.mean`] = meanCI;
    H[`${pre}.step.k${K}.rmsRatio`] = ratioCI;
    H[`${pre}.leak.k${K}`] = leakRep;
    if (K === 5) {
      const share = (key) =>
        clusterBootstrap(
          alloc,
          byYear,
          (xs) =>
            olsOrigin(
              xs.map((x) => x.gap),
              xs.map((x) => x[key]),
            ),
          boot,
        );
      out.alloc = { n: alloc.length, mover: share('dm'), mate: share('ds'), car: share('dc') };
      H[`${pre}.alloc.mover`] = out.alloc.mover;
      H[`${pre}.alloc.mate`] = out.alloc.mate;
      H[`${pre}.alloc.car`] = out.alloc.car;
    }
  }
  return out;
}
