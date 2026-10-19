// Property 3: when the car moves a lot, the drivers' ratings do not move with it.
//
// Records of "driver d stayed with team T while T's car moved": over each winter (last weekend of the old season to the
// third weekend of the new one) and over in-season windows of six weekends. Each carries the driver's rating change
// (dD) and his car's (dC), both net of stable entities, and the tags that decide how to read it:
//   unchanged   the team kept its whole lineup, so how a swing in the team's pace splits between drivers and car is set
//               by the model's assumptions alone (no data tells them apart); the leak seen here is the price of that prior;
//   changed     a mover or rookie joined, so the split is identified by data;
//   reg         the winter is a regulation change (a list kept by hand, so events are not chosen by the model);
//   takeover / rename   the constructor changed hands or only its name (lineage.js).
// Headline numbers: the slope of dD on dC (0 = no leak) in each group, and the same slope on the team's observed
// performance change (`leakFree`: no rating involved on the car side, so a model that never lets the car move cannot hide), how much more drivers move in a regulation winter
// than in a normal one, and whether the gap between two teammates gets more volatile when the car moves.
import { clusterBootstrap, corr, mean, ols, rms } from './stats.js';
import { CONSTRUCTOR_LINEAGE } from '../../core/src/lineage.js';
import { REGULATION_YEARS, carPost, driverPost, makeControls } from './events.js';

const byYear = (it) => it.year;
const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function lineageTag(year, cidOld, cidNew) {
  const e = CONSTRUCTOR_LINEAGE.find((l) => l.year === year && l.to === cidNew && (l.from === cidOld || cidOld === undefined));
  return e ? (e.kind === 'rename' ? 'rename' : 'takeover') : 'none';
}

/**
 * How a team did against everyone else in the K weekends it raced up to weekend i, from the results alone (no rating
 * involved): the weighted share of its drivers' duels with other teams that they won, as log-odds, in rating points.
 * Returns NaN when it has no such duels.
 */
export function teamPerformance(idx, run, team, i, K = 3) {
  const weeks = idx.teamWeeks.get(team);
  const pos = weeks.indexOf(i);
  if (pos < 0) return NaN;
  let won = 0;
  let w = 0;
  for (const wk of weeks.slice(Math.max(0, pos - K + 1), pos + 1)) {
    for (const ob of idx.timeline[wk].obs[run.session]) {
      if (ob.same) continue;
      const xIn = idx.teamAt[wk].get(ob.x) === team;
      const yIn = idx.teamAt[wk].get(ob.y) === team;
      if (xIn === yIn) continue;
      won += ob.w * (xIn ? ob.o : 1 - ob.o);
      w += ob.w;
    }
  }
  if (!w) return NaN;
  const p = Math.min(0.98, Math.max(0.02, won / w));
  return Math.log(p / (1 - p)) / run.k;
}

/** Winter and in-season records of drivers who stayed with their team. */
export function shockRecords(idx, run, { K = 3, W = 6, regYears = REGULATION_YEARS } = {}) {
  const controls = makeControls(idx, run);
  const records = [];
  const addRecords = (kind, team, i0, i1, year) => {
    const l0 = idx.lineup[i0].get(team);
    const l1 = idx.lineup[i1].get(team);
    const stay = l0.filter((d) => l1.includes(d));
    if (!stay.length) return;
    const cid0 = idx.cidAt[i0].get(stay[0]);
    const cid1 = idx.cidAt[i1].get(stay[0]);
    const car0 = idx.carOf(cid0);
    const car1 = idx.carOf(cid1);
    const cc = controls.cars(i0, i1);
    const cd = controls.drivers(i0, i1);
    if (!cc || !cd) return;
    const dC = carPost(run, i1, cid1) - carPost(run, i0, cid0) - cc.mean;
    if (!Number.isFinite(dC)) return;
    const tag = kind === 'winter' ? lineageTag(year, cid0, cid1) : 'none';
    const dPerf = teamPerformance(idx, run, team, i1) - teamPerformance(idx, run, team, i0);
    const unchanged = sameList(l0, l1);
    const ds = stay.map((d) => driverPost(run, i1, d) - driverPost(run, i0, d) - cd.mean);
    stay.forEach((d, n) => {
      if (!Number.isFinite(ds[n])) return;
      records.push({
        year,
        kind,
        team,
        driverId: d,
        dD: ds[n],
        dC,
        dPerf,
        unchanged,
        reg: regYears.includes(year),
        sameCar: car0 === car1,
        carEvent: tag,
        gapChange: unchanged && stay.length === 2 ? Math.abs(ds[0] - ds[1]) : NaN,
        i0,
        i1,
      });
    });
  };
  for (const [team, weeks] of idx.teamWeeks) {
    const years = [...new Set(weeks.map((i) => idx.year(i)))];
    for (const y of years) {
      const mine = weeks.filter((i) => idx.year(i) === y);
      const prev = weeks.filter((i) => idx.year(i) === y - 1);
      if (prev.length && mine.length >= K) addRecords('winter', team, prev[prev.length - 1], mine[K - 1], y);
      for (let a = 0; a + W < mine.length; a += W) {
        const i0 = mine[a];
        const i1 = mine[a + W];
        if (sameList(idx.lineup[i0].get(team), idx.lineup[i1].get(team))) addRecords('season', team, i0, i1, y);
      }
    }
  }
  return records;
}

const slope = (xs) =>
  ols(
    xs.map((x) => x.dC),
    xs.map((x) => x.dD),
  ).b;
// the same on the team's observed performance change instead of the estimated car: it cannot be fooled by a model that
// refuses to let the car move
const slopeFree = (xs) => {
  const f = xs.filter((x) => Number.isFinite(x.dPerf));
  return ols(
    f.map((x) => x.dPerf),
    f.map((x) => x.dD),
  ).b;
};

export function shockMetrics(idx, run, { boot = {}, ...rest } = {}) {
  const recs = shockRecords(idx, run, rest);
  const pre = `shocks.${run.session}`;
  const H = {};
  const out = { n: recs.length, groups: {}, headline: H };
  const winter = recs.filter((r) => r.kind === 'winter');
  const season = recs.filter((r) => r.kind === 'season');
  const groups = {
    'winter, lineup unchanged': winter.filter((r) => r.unchanged && r.sameCar),
    'winter, a driver joined': winter.filter((r) => !r.unchanged && r.sameCar),
    'winter, regulation change': winter.filter((r) => r.reg && r.sameCar),
    'winter, no regulation change': winter.filter((r) => !r.reg && r.sameCar),
    'in-season windows': season.filter((r) => r.sameCar),
  };
  const keys = {
    'winter, lineup unchanged': 'leak.winterUnchanged',
    'winter, a driver joined': 'leak.winterJoined',
    'winter, regulation change': 'leak.winterReg',
    'winter, no regulation change': 'leak.winterNormal',
    'in-season windows': 'leak.season',
  };
  for (const [name, items] of Object.entries(groups)) {
    const ci = clusterBootstrap(items, byYear, slope, boot);
    out.groups[name] = {
      n: items.length,
      slope: ci,
      corr: corr(
        items.map((x) => x.dC),
        items.map((x) => x.dD),
      ),
      carRms: rms(items.map((x) => x.dC)),
      driverRms: rms(items.map((x) => x.dD)),
    };
    H[`${pre}.${keys[name]}`] = ci;
    out.groups[name].slopeFree = clusterBootstrap(items, byYear, slopeFree, boot);
    H[`${pre}.${keys[name].replace('leak.', 'leakFree.')}`] = out.groups[name].slopeFree;
  }
  // do drivers move more in a regulation winter than in a normal one? (they should not, if the car takes the shock)
  const ratio = (xs) => {
    const a = xs.filter((x) => x.reg).map((x) => x.dD);
    const b = xs.filter((x) => !x.reg).map((x) => x.dD);
    return a.length > 5 && b.length > 5 ? rms(a) / rms(b) : NaN;
  };
  const carRatio = (xs) => {
    const a = xs.filter((x) => x.reg).map((x) => x.dC);
    const b = xs.filter((x) => !x.reg).map((x) => x.dC);
    return a.length > 5 && b.length > 5 ? rms(a) / rms(b) : NaN;
  };
  const steady = winter.filter((r) => r.sameCar);
  out.driverRmsRatioReg = clusterBootstrap(steady, byYear, ratio, boot);
  out.carRmsRatioReg = clusterBootstrap(steady, byYear, carRatio, boot);
  H[`${pre}.driverRmsRatioReg`] = out.driverRmsRatioReg;
  H[`${pre}.carRmsRatioReg`] = out.carRmsRatioReg;
  // does the gap between two teammates get more volatile when the car moves? (|gap change| on |car change|, unchanged pairs)
  const pairs = winter.filter((r) => Number.isFinite(r.gapChange) && r.sameCar);
  out.gapVolatility = clusterBootstrap(
    pairs,
    byYear,
    (xs) =>
      ols(
        xs.map((x) => Math.abs(x.dC)),
        xs.map((x) => x.gapChange),
      ).b,
    boot,
  );
  H[`${pre}.gapVolatility`] = out.gapVolatility;
  out.gapMean = {
    reg: mean(pairs.filter((r) => r.reg).map((r) => r.gapChange)),
    normal: mean(pairs.filter((r) => !r.reg).map((r) => r.gapChange)),
  };

  // winters in which the team changed hands or name: what the car and the drivers did
  const events = new Map();
  for (const r of winter.filter((x) => x.carEvent !== 'none')) {
    const key = `${r.year}|${r.team}|${r.carEvent}`;
    if (!events.has(key)) events.set(key, { year: r.year, team: r.team, carEvent: r.carEvent, dC: r.dC, dD: [] });
    events.get(key).dD.push(r.dD);
  }
  out.lineage = [...events.values()].map((e) => ({ ...e, dD: mean(e.dD), n: e.dD.length })).sort((a, b) => a.year - b.year);
  return out;
}
