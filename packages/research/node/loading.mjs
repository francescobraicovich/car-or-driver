// Loading of race skill on qualifying skill within one car: per season, the slope and correlation of teammates' race gap on their qualifying gap, from the
// independent filters (no car in a teammate difference). The motivation of the cross-session link (docs/detach.md). Output: research/eval/detach-loading.txt

import { loadData } from './common.mjs';
import { stateSpaceRun, truncateTimeline } from '../../eval/src/index.js';
import { prepareReal } from '../../eval/src/pipeline.js';
import { merge } from './separation-report.mjs';
const data = await loadData(new URL('../../../data', import.meta.url).pathname);
const prep = prepareReal(data, { holdout: false });
const tl = truncateTimeline(prep.timeline, 2015);
const b = merge({});
const race = stateSpaceRun(tl, 'race', prep.ctx, b.race),
  qual = stateSpaceRun(tl, 'qual', prep.ctx, b.qual);
const byYear = {};
tl.forEach((w, k) => {
  const teams = new Map();
  for (const r of w.rows) {
    const a = teams.get(r.constructorId) ?? [];
    a.push(r.driverId);
    teams.set(r.constructorId, a);
  }
  for (const [, ds] of teams)
    if (ds.length === 2) {
      const [x, y] = ds;
      const rx = race.post[k].drivers.get(x),
        ry = race.post[k].drivers.get(y),
        qx = qual.post[k].drivers.get(x),
        qy = qual.post[k].drivers.get(y);
      if (!(rx?.seen && ry?.seen && qx?.seen && qy?.seen)) continue;
      (byYear[w.year] ??= []).push([qx.m - qy.m, rx.m - ry.m]);
    }
});
for (const [y, a] of Object.entries(byYear)) {
  const sxy = a.reduce((s, [q, r]) => s + q * r, 0),
    sxx = a.reduce((s, [q]) => s + q * q, 0),
    syy = a.reduce((s, [, r]) => s + r * r, 0);
  console.log(
    y,
    'n',
    a.length,
    'slope race~qual',
    (sxy / sxx).toFixed(2),
    'corr',
    (sxy / Math.sqrt(sxx * syy)).toFixed(2),
    'sd q',
    Math.sqrt(sxx / a.length).toFixed(1),
    'sd r',
    Math.sqrt(syy / a.length).toFixed(1),
  );
}
