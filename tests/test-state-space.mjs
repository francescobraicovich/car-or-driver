// The state-space ratings: the filter on a world with known answers, no look-ahead, symmetry, and the invariants
// that tie the forecast layer to the state-space ratings.
import assert from 'node:assert/strict';
import { loadData } from '../packages/research/node/common.mjs';
import { runStateSpace, STATE_SPACE_DEFAULTS } from '../packages/core/src/state-space/filter.js';
import { qualLink } from '../packages/core/src/state-space/qualifying-link.js';
import { buildStateSpace, canonicalTeam, carLineage, ssContext } from '../packages/core/src/state-space/build.js';
import { collectExam } from '../packages/core/src/state-space/exam.js';
import { eloBenchmark } from '../packages/core/src/elo-benchmark.js';
import { ratingsAlone } from '../packages/core/src/state-space/forecast.js';
import { buildEloForecast } from '../packages/core/src/elo-forecast.js';
import { forecastPair } from '../packages/core/src/forecast/prepare.js';
import { formShifts } from '../packages/core/src/forecast/form-shift.js';
import { scenarioForecast } from '../packages/core/src/forecast/scenario.js';
import { summarizeBacktest } from '../packages/core/src/backtest.js';
import { STATE_SPACE } from '../packages/core/src/presets/state-space.js';

// ---- 1) a small world with known strengths ----------------------------------------------------------------
{
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const gumbel = () => -Math.log(-Math.log(rnd() + 1e-12));
  const drivers = { a: 40, b: -30, c: 10, d: -20, e: 25, f: -15 }; // true driver levels
  const cars = { X: 60, Y: 0, Z: -60 }; // true car levels
  const lineup = (year) =>
    year < 2002
      ? [
          ['a', 'X'],
          ['b', 'X'],
          ['c', 'Y'],
          ['d', 'Y'],
          ['e', 'Z'],
          ['f', 'Z'],
        ]
      : [
          ['a', 'Y'],
          ['b', 'X'],
          ['c', 'X'],
          ['d', 'Z'],
          ['e', 'Y'],
          ['f', 'Z'],
        ]; // some drivers change team
  const weekends = [];
  for (let year = 2000; year < 2004; year++)
    for (let r = 0; r < 16; r++) {
      const rows = lineup(year).map(([driverId, constructorId]) => ({ driverId, constructorId }));
      const scored = rows.map((row) => ({ row, s: drivers[row.driverId] + cars[row.constructorId] + (75 / Math.LN10) * gumbel() }));
      scored.sort((x, y) => y.s - x.s);
      const obs = [];
      for (let i = 0; i < scored.length; i++)
        for (let j = i + 1; j < scored.length; j++) {
          const x = scored[i].row;
          const y = scored[j].row;
          const same = x.constructorId === y.constructorId;
          obs.push({
            x: x.driverId,
            y: y.driverId,
            cx: x.constructorId,
            cy: y.constructorId,
            o: 1,
            w: (same ? 8 : 1) * 12,
            same,
            src: 'finish',
          });
        }
      weekends.push({ year, rows, obs });
    }
  const hyper = { ...STATE_SPACE_DEFAULTS, tau: 0.05 };
  const ctx = { canon: (id) => id, tmBoost: 8 };
  const run = runStateSpace(weekends, hyper, ctx);
  const last = run.ratings.at(-1);
  const meanD = Object.values(drivers).reduce((x, y) => x + y, 0) / 6;
  const meanC = Object.values(cars).reduce((x, y) => x + y, 0) / 3;
  const errD = Object.keys(drivers).map((id) => last.drivers.get(id).m - (drivers[id] - meanD));
  const errC = Object.keys(cars).map((id) => last.cars.get(id).m - (cars[id] - meanC));
  const rmse = (xs) => Math.sqrt(xs.reduce((a, v) => a + v * v, 0) / xs.length);
  assert.ok(rmse(errC) < 25, `car levels recovered (rmse ${rmse(errC).toFixed(1)} of a spread of ${rmse(Object.values(cars)).toFixed(0)})`);
  assert.ok(rmse(errD) < 25, `driver levels recovered (rmse ${rmse(errD).toFixed(1)})`);
  const order = (ids, get) => [...ids].sort((p, q) => get(q) - get(p)).join('');
  assert.equal(
    order(Object.keys(cars), (id) => last.cars.get(id).m),
    'XYZ',
    'car order recovered',
  );
  assert.ok(
    [...last.drivers.values()].every((d) => d.sd > 0 && d.sd < STATE_SPACE_DEFAULTS.sdD),
    'driver uncertainty is positive and below the prior',
  );
  assert.ok(Math.abs([...last.drivers.values()].reduce((a, d) => a + d.m, 0)) < 1e-9, 'driver ratings are centred on the field');

  // swapping who is called x and who is called y in every observation changes nothing
  const flipped = weekends.map((w) => ({
    ...w,
    obs: w.obs.map((o) => ({ ...o, x: o.y, y: o.x, cx: o.cy, cy: o.cx, o: 1 - o.o })),
  }));
  const runFlip = runStateSpace(flipped, hyper, ctx);
  for (const [id, d] of last.drivers) assert.ok(Math.abs(runFlip.ratings.at(-1).drivers.get(id).m - d.m) < 1e-6, `swap symmetry for ${id}`);

  // no look-ahead: ratings after weekend k do not change when later weekends exist
  const early = runStateSpace(weekends.slice(0, 40), hyper, ctx);
  for (const [id, d] of early.ratings[39].drivers) assert.equal(run.ratings[39].drivers.get(id).m, d.m, `prefix invariance for ${id}`);
  // the levels exposed for forecasting a weekend are exactly the state its own pairs are forecast from:
  // (driver + car of x) - (driver + car of y) equals the filter's prior mean for that pair, and they ignore later weekends
  weekends.forEach((w, i) => {
    w.obs.forEach((o, q) => {
      const gap = run.pre[i].drivers.get(o.x) + run.pre[i].cars.get(o.cx) - run.pre[i].drivers.get(o.y) - run.pre[i].cars.get(o.cy);
      assert.ok(
        Math.abs(gap - run.predictions[i].mean[q]) < 1e-9,
        `pre-weekend levels reproduce the forecast of pair ${q} in weekend ${i}`,
      );
    });
  });
  for (const [id, v] of early.pre[39].drivers) assert.equal(run.pre[39].drivers.get(id), v, `pre-weekend levels use no later data (${id})`);

  // ---- the cross-session link: a second world is read as the "qualifying run" (any run with `post` will do)
  {
    const other = weekends.map((w) => ({ ...w, obs: w.obs.map((o) => ({ ...o, o: 1 - o.o })) })); // opposite results: the "qualifying" order is the reverse
    const qFull = runStateSpace(other, hyper, ctx);
    const linked = (qRun, wk) => runStateSpace(wk, hyper, { ...ctx, ...qualLink(qRun, 0.5, 0.4) });
    // off: beta = gamma = 0 changes nothing
    const off = runStateSpace(weekends, hyper, { ...ctx, ...qualLink(qFull, 0, 0) });
    for (const [id, d] of run.ratings.at(-1).drivers)
      assert.equal(off.ratings.at(-1).drivers.get(id).m, d.m, `link off is a no-op (${id})`);
    // on: it moves the ratings, and the exposed levels still reproduce each pair's forecast
    const on = linked(qFull, weekends);
    let moved = 0;
    for (const [id, d] of run.ratings[2].drivers) moved += Math.abs(on.ratings[2].drivers.get(id).m - d.m); // a prior: it matters while data are few
    assert.ok(moved > 1, 'the link changes the early race ratings');
    weekends.forEach((w, i) =>
      w.obs.forEach((o, q) => {
        const gap = on.pre[i].drivers.get(o.x) + on.pre[i].cars.get(o.cx) - on.pre[i].drivers.get(o.y) - on.pre[i].cars.get(o.cy);
        assert.ok(
          Math.abs(gap - on.predictions[i].mean[q]) < 1e-9,
          `linked pre-weekend levels reproduce the forecast of pair ${q} in weekend ${i}`,
        );
      }),
    );
    // no look-ahead through the link: qualifying results from weekend 30 on do not touch the forecasts of weekends up to 30 (a forecast reads the
    // qualifying through the weekend before) nor the ratings posted before 30
    const changed = other.map((w, i) => (i < 30 ? w : weekends[i]));
    const qAlt = runStateSpace(changed, hyper, ctx);
    const alt = linked(qAlt, weekends);
    for (let i = 0; i <= 30; i++) {
      assert.deepEqual(
        Array.from(alt.predictions[i].mean),
        Array.from(on.predictions[i].mean),
        `forecasts of weekend ${i} ignore later qualifying`,
      );
      if (i < 30)
        for (const [id, d] of on.ratings[i].drivers)
          assert.equal(alt.ratings[i].drivers.get(id).m, d.m, `ratings posted at ${i} ignore later qualifying (${id})`);
    }
    // a constant added to every qualifying level moves no forecast (only gaps matter)
    const shifted = {
      post: qFull.ratings.map((p) => ({
        drivers: new Map([...p.drivers].map(([id, r]) => [id, { ...r, m: r.m + 25 }])),
        cars: new Map([...p.cars].map(([id, r]) => [id, { ...r, m: r.m + 25 }])),
      })),
    };
    const sh = linked(shifted, weekends);
    for (let i = 5; i < weekends.length; i += 7)
      for (let q = 0; q < on.predictions[i].mean.length; q += 3)
        assert.ok(
          Math.abs(sh.predictions[i].mean[q] - on.predictions[i].mean[q]) < 1e-6,
          'a common shift of the qualifying levels changes no gap',
        );
    console.log(
      'PASS cross-session link: off is a no-op, no look-ahead, forecasts reproduce their pre-weekend levels, common shifts cancel',
    );
  }
  console.log(
    `PASS state-space filter: known levels recovered (car rmse ${rmse(errC).toFixed(1)}, driver rmse ${rmse(errD).toFixed(1)}), swap-symmetric, no look-ahead`,
  );
}

// ---- 1b) how a new driver enters --------------------------------------------------------------------------------
{
  // two veterans in separate cars race for two seasons; in the third a newcomer joins the first car as teammate of "a"
  const rowsOld = [
    { driverId: 'a', constructorId: 'X' },
    { driverId: 'b', constructorId: 'Y' },
  ];
  const rowsNew = [...rowsOld, { driverId: 'n', constructorId: 'X' }];
  const pairs = (rows) => {
    const out = [];
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) {
        const [x, y] = [rows[i], rows[j]];
        out.push({
          x: x.driverId,
          y: y.driverId,
          cx: x.constructorId,
          cy: y.constructorId,
          o: x.driverId < y.driverId ? 1 : 0,
          w: 10,
          same: x.constructorId === y.constructorId,
          src: 'finish',
        });
      }
    return out;
  };
  const weekends = [];
  for (const year of [2000, 2001]) for (let r = 0; r < 6; r++) weekends.push({ year, rows: rowsOld, obs: pairs(rowsOld) });
  for (let r = 0; r < 10; r++) weekends.push({ year: 2002, rows: rowsNew, obs: pairs(rowsNew) });
  const ctx = { canon: (id) => id, tmBoost: 8 };
  const base = { tau: 0.05 };
  const off = runStateSpace(weekends, base, ctx);
  const first = 12; // the newcomer's first weekend

  // options off are exactly the old model
  const explicit = runStateSpace(weekends, { ...base, sdRel: 0, muNew: 0, relStart: 0, sdR: 0, dipR: 0, mRookieCross: 1 }, ctx);
  assert.equal(explicit.ratings[first].drivers.get('n').m, off.ratings[first].drivers.get('n').m, 'rookie options off change nothing');

  // a fading debut dip: the newcomer starts below where he would, and the gap closes
  const dip = runStateSpace(weekends, { ...base, sdR: 5, dipR: 40, rhoR: 0.7 }, ctx);
  const gap = (k) => off.ratings[k].drivers.get('n').m - dip.ratings[k].drivers.get('n').m;
  assert.ok(gap(first) > 5, `the debut dip lowers a newcomer's first rating (${gap(first).toFixed(1)} points)`);
  assert.ok(Math.abs(gap(first + 9)) < Math.abs(gap(first)) * 0.5, 'and fades over the following weekends');
  const sparse = weekends.map((weekend, index) => (index >= first && index < first + 9 ? { ...weekend, obs: [] } : weekend));
  const sparseOff = runStateSpace(sparse, base, ctx);
  const sparseDip = runStateSpace(sparse, { ...base, sdR: 5, dipR: 40, rhoR: 0.7 }, ctx);
  const delayedPrior = sparseOff.pre[first + 9].drivers.get('n') - sparseDip.pre[first + 9].drivers.get('n');
  assert.ok(
    Math.abs(delayedPrior - 40 * 0.7 ** 9) < 1e-9,
    'a qualifying filter with nine missing rookie sessions uses the already faded debut prior',
  );
  assert.equal(
    dip.ratings[first - 1].drivers.get('a').m,
    off.ratings[first - 1].drivers.get('a').m,
    'veterans are untouched before the debut',
  );

  // teammate-anchored start: before any result, the newcomer is predicted at his teammate's level plus the offset
  const anchored = runStateSpace(weekends, { ...base, sdRel: 10, muRel: -20 }, ctx);
  const q = weekends[first].obs.findIndex((o) => o.x === 'a' && o.y === 'n');
  assert.ok(Math.abs(anchored.predictions[first].mean[q] - 20) < 1e-9, 'the anchored newcomer is forecast 20 points below his teammate');
  assert.ok(Math.abs(off.predictions[first].mean[q]) < 60, 'a fixed start knows nothing about the teammate');
  const spread = (run) => run.predictions[first].varD[q];
  assert.ok(spread(anchored) < spread(off), 'and is more certain about the gap to his teammate than a fixed start is');

  // rookie flags: a driver of the first season is never a rookie; a newcomer is one for rookieN weekends
  assert.ok(
    ![...off.ratings[first].drivers.values()].filter((d) => d.rookie).some((d) => d.n > 5),
    'no rookie has had more than five weekends',
  );
  assert.equal(off.ratings[first].drivers.get('n').rookie, true, 'the newcomer is a rookie');
  assert.equal(off.ratings[first - 1].drivers.get('a').rookie, false, 'first-season drivers are not');
  assert.equal(off.ratings[first + 5].drivers.get('n').rookie, false, 'and the flag clears after five weekends');
  console.log(
    'PASS new drivers: options are no-ops when off, the debut dip fades, the anchored start is exact, rookie flags clear after five weekends',
  );
}

// ---- 1c) a renamed team keeps its car ---------------------------------------------------------------------------
{
  // X is much the faster car for two seasons, then races on as X2; Y never changes. Results never vary.
  const rows = (x) => [
    { driverId: 'a', constructorId: x },
    { driverId: 'b', constructorId: x },
    { driverId: 'c', constructorId: 'Y' },
    { driverId: 'd', constructorId: 'Y' },
  ];
  const pairs = (rs) => {
    const out = [];
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const [x, y] = [rs[i], rs[j]];
        out.push({
          x: x.driverId,
          y: y.driverId,
          cx: x.constructorId,
          cy: y.constructorId,
          o: 1,
          w: 10,
          same: x.constructorId === y.constructorId,
          src: 'finish',
        });
      }
    return out;
  };
  const weekends = [];
  for (const year of [2000, 2001]) for (let r = 0; r < 8; r++) weekends.push({ year, rows: rows('X'), obs: pairs(rows('X')) });
  for (let r = 0; r < 4; r++) weekends.push({ year: 2002, rows: rows('X2'), obs: pairs(rows('X2')) });
  const first = 16; // the first weekend as X2
  const canon = (id) => (id === 'X2' ? 'X' : id);
  const kept = runStateSpace(weekends, { tau: 0.05 }, { canon, carOf: canon, tmBoost: 8 });
  const fresh = runStateSpace(weekends, { tau: 0.05 }, { canon, tmBoost: 8 });
  const q = weekends[first].obs.findIndex((o) => o.x === 'a' && o.y === 'c');
  // before X2's first race: carried over, X2 is forecast well clear of Y, as X was; a fresh car would not be
  assert.ok(
    kept.predictions[first].mean[q] > 60,
    `the renamed car keeps its level (${kept.predictions[first].mean[q].toFixed(0)} points over Y)`,
  );
  assert.ok(
    kept.predictions[first].mean[q] > fresh.predictions[first].mean[q] + 30,
    `a fresh car would start near the field (${fresh.predictions[first].mean[q].toFixed(0)} points)`,
  );
  assert.ok(kept.predictions[first].vari[q] < fresh.predictions[first].vari[q], 'and is more certain than a fresh car');
  // outputs stay keyed by constructor id, and the forecast levels still reproduce the pair forecasts
  assert.ok(kept.ratings[first].cars.has('X2') && !kept.ratings[first].cars.has('X'), 'ratings are keyed by the id raced under');
  const gap =
    kept.pre[first].drivers.get('a') + kept.pre[first].cars.get('X2') - kept.pre[first].drivers.get('c') - kept.pre[first].cars.get('Y');
  assert.ok(Math.abs(gap - kept.predictions[first].mean[q]) < 1e-9, 'pre-weekend levels reproduce the forecast across a rename');
  // without carOf nothing changes: the default is one car per constructor id
  const explicit = runStateSpace(weekends, { tau: 0.05 }, { canon, carOf: (id) => id, tmBoost: 8 });
  assert.equal(explicit.predictions[first].mean[q], fresh.predictions[first].mean[q], 'carOf defaults to the constructor id');
  console.log('PASS renamed team: the car carries over, outputs keep the raced id, the default is unchanged');
}

// ---- 2) the state-space model on the real data ----------------------------------------------------------------------
const ctx = await loadData('data');
const args = [ctx.raw, ctx.lapSnapshots, ctx.maps, {}, ctx.lapPace];
const eloModel = buildEloForecast(...args);
const t0 = performance.now();
const ssModel = buildStateSpace(...args, { benchmark: eloBenchmark });
console.log(`state-space build ${((performance.now() - t0) / 1000).toFixed(1)} s`);

// A wide prior must not throw a rating far from the data. Widening car and new-driver priors (as a takeover or a
// longer winter would) used to send car levels to the hundreds of thousands: the covariance update read columns of
// P it had already overwritten, which turned P indefinite, and an overshooting Newton step did the rest.
{
  const { model, weekends } = collectExam(...args);
  const wk = weekends.map((w) => ({ year: w.year, rows: w.rows, obs: w.raceObs }));
  for (const wide of [
    { sdC: 150, winterC: 150 },
    { sdC: 400, winterC: 400, sdNew: 200 },
  ]) {
    const run = runStateSpace(wk, { ...STATE_SPACE.race, ...wide }, ssContext(model.params.tmBoost));
    let top = 0;
    for (const rt of run.ratings) for (const [, c] of rt.cars) top = Math.max(top, Math.abs(c.m));
    assert.ok(top < 600, `car levels stay near the data with a prior ${JSON.stringify(wide)} (largest ${top.toFixed(0)})`);
    const { cov } = run.latest;
    assert.ok(
      cov.every((row, i) => row[i] >= 0),
      'variances stay non-negative',
    );
  }
  console.log('PASS wide priors: levels stay bounded and variances non-negative');
}

assert.equal(ssModel.params.modelKind, 'state-space');
assert.equal(ssModel.snaps.length, eloModel.snaps.length);

// the forecast layer: the form trackers do not read ratings, so they are exactly the Elo model's; its rating inputs are the
// state-space levels, so its probabilities differ from eloModel's and stay symmetric
assert.equal(
  JSON.stringify(ssModel.forecastState.form),
  JSON.stringify(eloModel.forecastState.form),
  'form trackers do not depend on the rating system',
);
const grid = eloModel.snaps
  .at(-1)
  .drivers.slice(0, 6)
  .map((d) => String(d.driverId));
let differs = 0;
for (const a of grid)
  for (const b of grid) {
    if (a === b) continue;
    const pSs = forecastPair(ssModel, a, b).p;
    assert.ok(Math.abs(pSs + forecastPair(ssModel, b, a).p - 1) < 1e-9, `forecast is symmetric for ${a} vs ${b}`);
    if (Math.abs(forecastPair(eloModel, a, b).p - pSs) > 1e-6) differs++;
  }
assert.ok(differs > 0, 'state-space forecasts read the state-space ratings, not the Elo ones');
{
  // the pieces the pages build on: form switched off is symmetric too, and the form shifts are finite and team-centred
  const r = forecastPair(ssModel, grid[0], grid[1]);
  const back = forecastPair(ssModel, grid[1], grid[0]);
  assert.ok(Math.abs(r.breakdown.calibrated + back.breakdown.calibrated - 1) < 1e-9, 'form-off forecast is symmetric');
  const shifts = formShifts(ssModel);
  assert.ok(shifts && [...shifts.values()].every(Number.isFinite), 'form shifts exist and are finite on the state-space model');
}

// ratings are centred on 1000 among each weekend's entrants, with uncertainty attached
for (const snap of ssModel.snaps) {
  const mean = (rows, key) => rows.reduce((s, r) => s + r[key], 0) / rows.length;
  assert.ok(Math.abs(mean(snap.drivers, 'race') - 1000) < 1e-6, `drivers centred on 1000 (${snap.year} ${snap.name})`);
  assert.ok(Math.abs(mean(snap.cars, 'race') - 1000) < 1e-6, 'cars centred on 1000');
  assert.ok(
    snap.drivers.every((d) => d.raceSd > 0 && Number.isFinite(d.combinedSd) && Number.isFinite(d.effective)),
    'every row has finite uncertainty and effective pace',
  );
}
// the Elo ratings are kept next to the new ones
const lastSnap = ssModel.snaps.at(-1);
for (const d of lastSnap.drivers) {
  const base = eloModel.snaps.at(-1).drivers.find((x) => x.driverId === d.driverId);
  assert.equal(d.eloRace, base.race, 'Elo race rating kept');
}
// histories hold the same values as the snapshots
for (const d of lastSnap.drivers) assert.equal(ssModel.dh.get(d.driverId).at(-1).race, d.race, 'history ends at the latest rating');
// the downloadable table carries the published ratings, for every weekend and driver (it once carried the Elo benchmark's)
{
  const byWeekend = new Map(ssModel.snaps.map((s) => [`${s.date}|${s.round}`, s]));
  assert.equal(
    ssModel.exportRows.length,
    ssModel.snaps.reduce((n, s) => n + s.drivers.length, 0),
    'one export row per driver and weekend',
  );
  for (const r of ssModel.exportRows) {
    const d = byWeekend.get(`${r.date}|${r.round}`).drivers.find((x) => x.name === r.driver);
    assert.equal(r.driverRace, d.race, 'export row carries the published race rating');
    assert.equal(r.driverCombined, d.combined, 'and the combined rating');
    assert.equal(r.packageEffective, d.packageEffective, 'and the package pace');
  }
}
// a debutant is flagged as new, with a race count, until his rating settles
const debut = ssModel.snaps.find((s) => s.year === 2025 && s.round === 1);
const newcomers = debut.drivers.filter((d) => d.newDriver);
assert.ok(
  newcomers.some((d) => d.name.includes('Antonelli') && d.races === 1) && newcomers.length >= 3,
  'the 2025 debutants are flagged new after one race',
);
assert.ok(
  debut.drivers.filter((d) => d.races > 5).every((d) => !d.newDriver),
  'drivers past their fifth race are not',
);
assert.ok(
  lastSnap.drivers.every((d) => typeof d.races === 'number'),
  'every driver row carries a race count',
);
// team-change detection treats renames as the same team
assert.equal(canonicalTeam('10'), canonicalTeam('211'), 'Force India and Racing Point are one team');
// the car carries over across a rename, not across a takeover
assert.equal(carLineage('211'), carLineage('117'), 'Racing Point and Aston Martin are one car');
assert.equal(carLineage('5'), carLineage('215'), 'Toro Rosso, AlphaTauri and RB are one car');
assert.notEqual(carLineage('19'), carLineage('9'), "Red Bull did not inherit Jaguar's car");
assert.notEqual(carLineage('15'), carLineage('217'), "Audi did not inherit Sauber's car");

// ratings alone beat the Elo ratings on the same observations, in every window
for (const [from, to] of [
  [2008, 2011],
  [2012, 2015],
  [2016, 2100],
]) {
  const ss = summarizeBacktest(ssModel, { burnIn: 20, fromYear: from, toYear: to, diag: 'ssDiag' }).overall.combinedLogLoss;
  const elo = summarizeBacktest(ssModel, { burnIn: 20, fromYear: from, toYear: to, diag: 'eloDiag' }).overall.combinedLogLoss;
  assert.ok(ss < elo, `state-space ratings beat Elo ratings alone in ${from}-${to} (${ss.toFixed(4)} vs ${elo.toFixed(4)})`);
}

// pair probabilities from the ratings alone
const [x, y] = grid;
const pxy = ratingsAlone(ssModel, x, y);
const pyx = ratingsAlone(ssModel, y, x);
assert.ok(
  Math.abs(pxy.p + pyx.p - 1) < 1e-9 && Math.abs(pxy.gap + pyx.gap) < 1e-9 && Math.abs(pxy.sd - pyx.sd) < 1e-9,
  'ratings-alone forecast is symmetric',
);
assert.ok(
  Math.abs(ratingsAlone(ssModel, x, x).p - 0.5) < 1e-12 && ratingsAlone(ssModel, x, x).sd < 1e-6,
  'a driver against himself is 50% with no uncertainty',
);
const team = new Map(lastSnap.drivers.map((d) => [String(d.driverId), d.constructorId]));
const mates = [];
for (const a of grid) for (const b of grid) if (a < b && team.get(a) === team.get(b)) mates.push([a, b]);
const cross = [grid[0], grid.find((g) => team.get(g) !== team.get(grid[0]))];
if (mates.length)
  assert.ok(
    ratingsAlone(ssModel, ...mates[0]).sd < ratingsAlone(ssModel, ...cross).sd,
    'a gap between teammates is known more precisely than a gap between teams',
  );

// what-if matchups work on the state-space model and are symmetric
const now = (id) => ({ driverId: id, when: { kind: 'latest' }, carId: '' });
const s1 = scenarioForecast(ssModel, now(x), now(y));
const s2 = scenarioForecast(ssModel, now(y), now(x));
assert.ok(!s1.error, s1.error);
assert.ok(Math.abs(s1.p + s2.p - 1) < 1e-9, 'what-if is symmetric on the state-space model');
assert.ok(scenarioForecast(ssModel, now(x), now(y), { wet: true }).p > 0, 'wet what-if works');

// the state-space settings are the preset's
assert.deepEqual(Object.keys(STATE_SPACE).sort(), ['adapt', 'link', 'qual', 'race']);
console.log(
  'PASS state-space: forecast layer on the state-space ratings, ratings centred with uncertainty, ratings alone beat Elo in every window, pair forecasts symmetric',
);

// the arrival adaptation: off by default, a known offset after a team change (no look-ahead, deterministic, only for established drivers)
{
  const { arrivalOffsets } = await import('../packages/core/src/state-space/qualifying-link.js');
  const wk = (rows) => ({ rows: rows.map(([driverId, constructorId]) => ({ driverId, constructorId })) });
  const weekends = [];
  for (let i = 0; i < 12; i++)
    weekends.push(
      wk([
        ['a', 'X'],
        ['b', 'Y'],
      ]),
    );
  for (let i = 0; i < 4; i++)
    weekends.push(
      wk([
        ['a', 'Y'],
        ['b', 'X'],
      ]),
    );
  const canon = (id) => id;
  assert.equal(arrivalOffsets(weekends, canon, null), null, 'off without parameters');
  assert.equal(arrivalOffsets(weekends, canon, { dip: 0, rho: 0.5 }), null, 'off at dip 0');
  const off = arrivalOffsets(weekends, canon, { dip: 20, rho: 0.5, minPrior: 10, span: 3 });
  assert.equal(off[11].size, 0, 'nothing before the move');
  assert.equal(off[12].get('a'), -20, 'first weekend at the new team');
  assert.equal(off[13].get('a'), -10);
  assert.equal(off[14].get('a'), -5);
  assert.equal(off[15].has('a'), false, 'gone after the span');
  const rookies = arrivalOffsets(weekends.slice(8), canon, { dip: 20, rho: 0.5, minPrior: 10 });
  assert.ok(
    rookies.every((m) => m.size === 0),
    'drivers with fewer than minPrior earlier weekends are not adapted',
  );
  console.log('PASS arrival adaptation: off by default, deterministic, only for established drivers, fades, no look-ahead');
}
