// New drivers. A rookie has no history, so what the model assumes for him decides his first races, and the car he
// drives is the only thing that can soak up a wrong assumption.
//
//   bias      mean of (outcome - forecast) over his duels in his first 5 and next 5 races, from his side: negative = the
//             start is too generous, positive = too harsh (teammates and other cars apart);
//   slope     calibration of those duels (1 = the stated confidence is right, less = over-confident);
//   curve     his rating after k races minus after 40: the drift that is still to come (a rating that climbs for years
//             started too low, or he learns; either way the first forecasts were off);
//   leak      slope of the change of the team's car over his first 5 races on the change of his own rating: a start
//             that is wrong shows up as the car and the rookie moving against each other.
import { clusterBootstrap, logisticCalibration, mean, ols, wmean } from './stats.js';
import { carPost, driverPost, makeControls } from './events.js';

const byYear = (it) => it.year;
const expit = (z) => 1 / (1 + Math.exp(-z));

function rookieDuels(idx, run, rookies, c, range) {
  const items = [];
  for (const rk of rookies) {
    rk.apps.slice(range[0], range[1]).forEach((app) => {
      idx.timeline[app.i].obs[run.session].forEach((ob, q) => {
        if (ob.x !== rk.driverId && ob.y !== rk.driverId) return;
        const sign = ob.x === rk.driverId ? 1 : -1;
        const z = c * sign * run.z[app.i].adj[q];
        items.push({
          year: rk.year,
          same: !!ob.same,
          z,
          o: sign > 0 ? ob.o : 1 - ob.o,
          w: ob.w,
          res: (sign > 0 ? ob.o : 1 - ob.o) - expit(z),
        });
      });
    });
  }
  return items;
}

export function rookieMetrics(idx, run, rookies, { calib = 1, boot = {} } = {}) {
  const controls = makeControls(idx, run);
  const pre = `rookies.${run.session}`;
  const H = {};
  const out = { n: rookies.length, duels: {}, curve: {}, headline: H };
  const bias = (xs) =>
    wmean(
      xs.map((x) => x.res),
      xs.map((x) => x.w),
    );
  const slope = (xs) =>
    logisticCalibration(
      xs.map((x) => x.z),
      xs.map((x) => x.o),
      xs.map((x) => x.w),
      { intercept: false },
    ).b;
  for (const [label, range] of [
    ['first5', [0, 5]],
    ['next5', [5, 10]],
  ]) {
    const items = rookieDuels(idx, run, rookies, calib, range);
    const mates = items.filter((x) => x.same);
    const cars = items.filter((x) => !x.same);
    out.duels[label] = {
      n: items.length,
      bias: clusterBootstrap(items, byYear, bias, boot),
      biasMates: clusterBootstrap(mates, byYear, bias, boot),
      biasCars: clusterBootstrap(cars, byYear, bias, boot),
      slope: clusterBootstrap(items, byYear, slope, boot),
    };
    H[`${pre}.bias.${label}`] = out.duels[label].bias;
    H[`${pre}.slope.${label}`] = out.duels[label].slope;
  }
  // learning curve against his rating after 40 races (drivers with at least 40 races)
  const long = rookies.filter((r) => r.apps.length >= 40);
  for (const k of [1, 5, 10, 20]) {
    const items = long
      .map((r) => ({ year: r.year, v: driverPost(run, r.apps[k - 1].i, r.driverId) - driverPost(run, r.apps[39].i, r.driverId) }))
      .filter((x) => Number.isFinite(x.v));
    out.curve[k] = { n: items.length, ...clusterBootstrap(items, byYear, (xs) => mean(xs.map((x) => x.v)), boot) };
    H[`${pre}.curve.k${k}`] = out.curve[k];
  }
  // leak into the car over the first five races
  const leakItems = [];
  for (const rk of rookies) {
    if (rk.apps.length < 5) continue;
    const t5 = rk.apps[4].i;
    const team = rk.team;
    const weeksBefore = idx.teamWeeks.get(team)?.filter((i) => i < rk.t0) ?? [];
    if (!weeksBefore.length) continue;
    const ellT = weeksBefore[weeksBefore.length - 1];
    if (idx.year(rk.t0) - idx.year(ellT) > 1) continue;
    const cc = controls.cars(ellT, t5);
    const cd = controls.drivers(rk.t0, t5);
    const cidA = idx.cidAt[ellT].get(idx.lineup[ellT].get(team)[0]);
    const cidB = rk.apps[4].cid;
    if (!cc || !cd || idx.carOf(cidA) !== idx.carOf(cidB)) continue;
    const dC = carPost(run, t5, cidB) - carPost(run, ellT, cidA) - cc.mean;
    const dD = driverPost(run, t5, rk.driverId) - driverPost(run, rk.t0, rk.driverId) - cd.mean;
    if (Number.isFinite(dC) && Number.isFinite(dD)) leakItems.push({ year: rk.year, dC, dD });
  }
  out.leak = {
    n: leakItems.length,
    ...clusterBootstrap(
      leakItems,
      byYear,
      (xs) =>
        ols(
          xs.map((x) => x.dD),
          xs.map((x) => x.dC),
        ).b,
      boot,
    ),
  };
  H[`${pre}.leak`] = out.leak;
  return out;
}
