// The evaluation harness (packages/eval): its statistics, its events, its synthetic worlds, and above all that its metrics
// DISCRIMINATE: a filter that leaks car swings into drivers lights up the leak tests, and a filter that freezes its drivers
// passes the property tests but loses on forecast loss (which is why the predictive score sits beside them).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadData } from '../packages/research/node/common.mjs';
import { deserialize } from '../packages/core/src/json-serialization.js';
import { summarizeBacktest } from '../packages/core/src/backtest.js';
import {
  STATE_SPACE_DEFAULTS,
  catalogue,
  clusterBootstrap,
  evaluateModel,
  eloRun,
  fitSlope,
  indexTimeline,
  logisticCalibration,
  nll,
  observationRows,
  ols,
  rng,
  stateSpaceRun,
  structuralMetrics,
  syntheticStudy,
  syntheticWorld,
  toyTimeline,
  truthMetrics,
  worldFromHyper,
} from '../packages/eval/src/index.js';
import { describe } from '../packages/eval/src/catalog.js';
import { compare, recoveryReport, scorecard } from '../packages/eval/src/report.js';
import { STATE_SPACE } from '../packages/core/src/presets/state-space.js';
import { eloForecastScores, prepareReal } from '../packages/eval/src/pipeline.js';

// ---- 1) statistics -----------------------------------------------------------------------------------------------
{
  const r = rng(5);
  const x = Array.from({ length: 400 }, () => r.normal());
  const y = x.map((v) => 0.5 * v + 0.1 * r.normal());
  assert.ok(Math.abs(ols(x, y).b - 0.5) < 0.02, 'ols recovers a slope');
  // outcomes drawn from sigmoid(0.7 z): the calibration slope through the origin recovers 0.7
  const z = Array.from({ length: 6000 }, () => 2 * r.normal());
  const o = z.map((v) => +(r.next() < 1 / (1 + Math.exp(-0.7 * v))));
  const cal = logisticCalibration(z, o, null, { intercept: false });
  assert.ok(Math.abs(cal.b - 0.7) < 0.06, `calibration slope recovered (${cal.b.toFixed(3)})`);
  assert.ok(Math.abs(nll(0, 1) - Math.LN2) < 1e-12 && nll(40, 1) < 1e-12 && Math.abs(nll(-40, 1) - 40) < 1e-9, 'stable log-loss');
  // the bootstrap interval of a mean covers the truth and is wider with few clusters
  const items = Array.from({ length: 300 }, (_, i) => ({ year: 2000 + (i % 15), v: r.normal() }));
  const ci = clusterBootstrap(
    items,
    (it) => it.year,
    (xs) => xs.reduce((a, b) => a + b.v, 0) / xs.length,
    { B: 200 },
  );
  assert.ok(ci.lo < 0.1 && ci.hi > -0.1 && ci.lo < ci.est && ci.est < ci.hi && ci.clusters === 15, 'cluster bootstrap interval');
  const again = clusterBootstrap(
    items,
    (it) => it.year,
    (xs) => xs.reduce((a, b) => a + b.v, 0) / xs.length,
    { B: 200 },
  );
  assert.deepEqual(ci, again, 'the bootstrap is seeded');
  console.log('PASS statistics: regression, calibration slope, seeded season bootstrap');
}

// ---- 2) events on a small league ---------------------------------------------------------------------------------
const toy = toyTimeline({ seasons: 14, races: 14, teams: 8, seed: 3 });
const id = { canon: (v) => v, carOf: (v) => v, tmBoost: 8 };
{
  const idx = indexTimeline(toy, id);
  const ev = catalogue(idx);
  assert.ok(ev.moves.length > 5 && ev.rookies.length > 5 && ev.changes.length > 5, 'the toy league has moves, rookies and lineup changes');
  for (const m of ev.moves) {
    assert.notEqual(idx.teamAt[m.ell].get(m.driverId), idx.teamAt[m.t0].get(m.driverId), 'a move changes team');
    assert.ok(
      m.ell < m.t0 && m.apps[0].i === m.t0 && m.apps.every((a) => a.team === m.to.team),
      'a stint is consecutive weekends for the new team',
    );
  }
  for (const r of ev.rookies) assert.equal(idx.appear.get(r.driverId)[0].i, r.t0, 'a rookie event is the first appearance');
  for (const c of ev.changes) {
    assert.ok(
      c.stayers.every((d) => !c.incoming.includes(d) && !c.outgoing.includes(d)),
      'stayers neither arrive nor leave',
    );
    assert.ok(
      c.incoming.every((d) => idx.lineup[c.t0].get(c.team).includes(d)) &&
        c.outgoing.every((d) => !idx.lineup[c.t0].get(c.team).includes(d)),
      'lineups before and after',
    );
  }
  // a stand-in (fewer than three races for the new team) is not a move: nobody in the league appears for a single weekend
  assert.ok(
    ev.moves.filter((m) => m.valid).every((m) => m.stint >= 3 && m.nPrior >= 10),
    'valid moves are established drivers with a real stint',
  );
  console.log(`PASS events: ${ev.moves.length} moves, ${ev.changes.length} lineup changes, ${ev.rookies.length} rookies on the toy league`);
}

// ---- 3) synthetic worlds -----------------------------------------------------------------------------------------
const base = { ...STATE_SPACE_DEFAULTS, sdD: 20, sdNew: 20, sdC: 30, rho: 0.8, winterC: 30, raceC: 1, yearD: 4, tau: 0.01 };
const stress = { ...worldFromHyper(base), winterC: 40, yearD: 8 };
{
  const idx0 = indexTimeline(toy, id);
  const a = syntheticWorld(toy, idx0, 'race', stress, 7);
  const b = syntheticWorld(toy, idx0, 'race', stress, 7);
  const c = syntheticWorld(toy, idx0, 'race', stress, 8);
  assert.deepEqual(
    a.timeline[5].obs.race.map((o) => o.o),
    b.timeline[5].obs.race.map((o) => o.o),
    'same seed, same world',
  );
  assert.notDeepEqual(
    a.timeline[5].obs.race.map((o) => o.o),
    c.timeline[5].obs.race.map((o) => o.o),
    'another seed, another world',
  );
  const real = toy[5].obs.race;
  assert.ok(
    a.timeline[5].obs.race.every((o, q) => o.x === real[q].x && o.y === real[q].y && o.w === real[q].w && o.same === real[q].same),
    'the pair structure of the real schedule is kept',
  );
  // every weekend's pairs derive from one ranking, so they are transitive (no cycles)
  const wk = a.timeline[40];
  const beats = new Map();
  for (const o of wk.obs.race) beats.set(`${o.x}>${o.y}`, o.o);
  const ids = [...new Set(wk.obs.race.flatMap((o) => [o.x, o.y]))];
  const wins = (d) => wk.obs.race.reduce((n, o) => n + (o.x === d ? o.o : o.y === d ? 1 - o.o : 0), 0);
  assert.equal(new Set(ids.map(wins)).size, ids.length, 'one ranking per weekend: all win counts differ');
  // truth is centred like the ratings
  const t = a.truth.drivers[40];
  assert.ok(Math.abs([...t.values()].reduce((s, v) => s + v, 0)) < 1e-6, 'true driver levels centred on the field');
  // heavy tails: still valid, different noise
  const h = syntheticWorld(toy, idx0, 'race', { ...stress, noise: 't3' }, 7);
  assert.notDeepEqual(
    h.timeline[5].obs.race.map((o) => o.o),
    a.timeline[5].obs.race.map((o) => o.o),
    't3 noise draws differently',
  );
  console.log('PASS synthetic worlds: seeded, real pair structure, one ranking per weekend, centred truth');
}

// ---- 4) the metrics discriminate ---------------------------------------------------------------------------------
{
  const configs = { matched: {}, leaky: { sdC: 2, winterC: 1, raceC: 0, yearD: 30 }, frozen: { yearD: 0, sdJ: 0 } };
  const acc = { matched: [], leaky: [], frozen: [] };
  const idx0 = indexTimeline(toy, id);
  for (const seed of [1, 2, 3]) {
    const w = syntheticWorld(toy, idx0, 'race', stress, seed);
    const idx = indexTimeline(w.timeline, id);
    const events = catalogue(idx);
    for (const [name, over] of Object.entries(configs)) {
      const run = stateSpaceRun(w.timeline, 'race', id, { ...base, ...over }, name);
      const rows = observationRows(idx, run);
      const c = fitSlope(rows);
      let s = 0;
      let ws = 0;
      for (const r of rows) {
        s += r.w * nll(c * r.z, r.o);
        ws += r.w;
      }
      const truth = truthMetrics(idx, run, w, { boot: { B: 40 }, moves: events.moves });
      const sm = structuralMetrics(idx, run, events, { calib: c, boot: { B: 40 } });
      acc[name].push({
        loss: s / ws,
        leakTruth: truth.leakTruth.winterUnchanged.est,
        leakFree: sm.shocks.groups['winter, lineup unchanged'].slopeFree.est,
        rmseD: truth.rmseDriver.est,
        z2: truth.coverage.driver.z2.est,
      });
    }
  }
  const avg = (name, key) => acc[name].reduce((s, r) => s + r[key], 0) / acc[name].length;
  // a filter that lets car swings fall on drivers: the leak against the true car swing, and the model-free leak, both light up
  assert.ok(
    avg('leaky', 'leakTruth') > avg('matched', 'leakTruth') + 0.2,
    `leak vs the true car swing: leaky ${avg('leaky', 'leakTruth').toFixed(3)} vs matched ${avg('matched', 'leakTruth').toFixed(3)}`,
  );
  assert.ok(
    avg('leaky', 'leakFree') > avg('matched', 'leakFree') + 0.2,
    `model-free leak: leaky ${avg('leaky', 'leakFree').toFixed(3)} vs matched ${avg('matched', 'leakFree').toFixed(3)}`,
  );
  assert.ok(
    avg('leaky', 'loss') > avg('matched', 'loss') + 0.005 && avg('leaky', 'rmseD') > avg('matched', 'rmseD'),
    'the leaky filter also forecasts and recovers worse',
  );
  // a filter that freezes its drivers passes the property tests ...
  assert.ok(
    avg('frozen', 'leakTruth') < avg('matched', 'leakTruth') + 0.02 && avg('frozen', 'leakFree') < avg('matched', 'leakFree') + 0.02,
    'frozen drivers leak no more than the matched filter',
  );
  // ... but loses on the score that sits beside them, and its error bars are worse
  assert.ok(
    avg('frozen', 'loss') > avg('matched', 'loss'),
    `frozen drivers lose on forecast loss (${avg('frozen', 'loss').toFixed(4)} vs ${avg('matched', 'loss').toFixed(4)})`,
  );
  assert.ok(avg('frozen', 'z2') > avg('matched', 'z2'), 'frozen drivers have over-confident error bars');
  console.log(
    `PASS discrimination: leak vs truth matched ${avg('matched', 'leakTruth').toFixed(3)}, leaky ${avg('leaky', 'leakTruth').toFixed(3)}, frozen ${avg('frozen', 'leakTruth').toFixed(3)}; loss ${avg('matched', 'loss').toFixed(4)} / ${avg('leaky', 'loss').toFixed(4)} / ${avg('frozen', 'loss').toFixed(4)}`,
  );
}

// ---- 4b) the reference world does not come from the candidate -----------------------------------------------------------
{
  // a candidate with rigid cars and drifting drivers must not be judged on a world with rigid cars and drifting drivers
  const leaky = { sdC: 2, winterC: 1, raceC: 0, yearD: 30 };
  const study = syntheticStudy(toy, id, { session: 'race', hyper: leaky, seeds: [1], tau: 'shipped', boot: { B: 20 } });
  assert.equal(study.world.sdC, STATE_SPACE.race.sdC, 'the reference world is drawn from the shipped settings');
  assert.equal(study.world.yearD, STATE_SPACE.race.yearD);
  const self = syntheticStudy(toy, id, { session: 'race', hyper: leaky, self: true, seeds: [1], tau: 'shipped', boot: { B: 20 } });
  assert.equal(self.world.sdC, 2, 'self: true draws the world from the filter under test');
  // a tau set by hand is the filter being evaluated, so it is kept
  const explicit = syntheticStudy(toy, id, { session: 'race', hyper: { tau: 0.0123 }, seeds: [1], tau: 'auto', boot: { B: 20 } });
  assert.equal(explicit.tau, 0.0123, 'an explicit tau is honoured');
  assert.equal(explicit.tauMode, 'explicit');
  // the recovery section prints the truth-based numbers, which do not depend on how the real data behave
  const text = recoveryReport({ same: study.summary });
  assert.ok(
    text.includes('Leak against the TRUE car swing') && text.includes('Recovery on synthetic worlds (race)'),
    'the recovery report renders',
  );
  console.log('PASS reference worlds: drawn from the shipped settings, explicit tau honoured, recovery report renders');
}

// ---- 5) a correctly specified filter reads like the theory says --------------------------------------------------
{
  const idx0 = indexTimeline(toy, id);
  const w = syntheticWorld(toy, idx0, 'race', worldFromHyper(base), 11);
  const idx = indexTimeline(w.timeline, id);
  const events = catalogue(idx);
  const run = stateSpaceRun(w.timeline, 'race', id, base, 'matched');
  const truth = truthMetrics(idx, run, w, { boot: { B: 40 }, moves: events.moves });
  const sm = structuralMetrics(idx, run, events, { calib: 1, boot: { B: 40 } });
  assert.ok(
    truth.coverage.driver.cover90.est > 0.75 && truth.coverage.driver.cover90.est < 0.99,
    `90% bars cover about 90% (${truth.coverage.driver.cover90.est.toFixed(2)})`,
  );
  assert.ok(Math.abs(Math.log(truth.coverage.driver.z2.est)) < Math.log(2), 'squared error over sd is about 1');
  assert.ok(truth.rmseDriver.est < 20, 'drivers are recovered better than the prior alone');
  // every headline key is described in the catalogue (reports and docs cannot drift from the metrics)
  for (const k of Object.keys(sm.headline)) assert.ok(describe(k), `headline key ${k} has a description`);
  for (const k of Object.keys(truth.headline)) assert.ok(describe(k), `truth key ${k} has a description`);
  // reports render
  const text = scorecard(sm.headline, {});
  assert.ok(text.includes('Movers') && text.includes('Car shocks') && text.includes('verdict'), 'the scorecard renders');
  assert.ok(compare(sm.headline, sm.headline).includes('metric'), 'compare renders');
  console.log('PASS matched filter: error bars cover, recovery beats the prior, every key described, reports render');
}

// ---- 6) wiring on the real data: regression scores for the 1994-start replay ---------------------------------
{
  const data = await loadData('data');
  const prep = prepareReal(data, { holdout: false });
  assert.ok(
    prep.timeline.every((w) => w.year <= 2015),
    'the holdout is cut before any filter runs unless asked for',
  );
  const snaps = prep.elo.snaps.slice(0, prep.n);
  const ctxShipped = { ...prep.ctx, linkShipped: true }; // the race filter reads the qualifying filter, as the build does
  const ss = { race: stateSpaceRun(prep.timeline, 'race', ctxShipped), qual: stateSpaceRun(prep.timeline, 'qual', ctxShipped) };
  const elo = {
    race: eloRun(prep.timeline, prep.weekends.slice(0, prep.n), snaps, 'race'),
    qual: eloRun(prep.timeline, prep.weekends.slice(0, prep.n), snaps, 'qual'),
  };
  const current = {
    ss: { fit: 0.383902, w2: 0.380038, w3: 0.363564 },
    elo: { fit: 0.405652, w2: 0.400992, w3: 0.373279 },
  };
  for (const [name, runs] of [
    ['ss', ss],
    ['elo', elo],
  ]) {
    const res = evaluateModel(prep.timeline, prep.identity, runs, { boot: { B: 20 } });
    for (const [win, v] of Object.entries(current[name])) {
      const got = res.headline[`predictive.loss.combined.all.${win}`].est;
      assert.ok(Math.abs(got - v) < 0.0001, `${name} ${win}: ${got.toFixed(4)} vs 1994-start fixture ${v}`);
    }
    for (const k of Object.keys(res.headline))
      if (!k.startsWith('forecast.')) assert.ok(describe(k), `headline key ${k} has a description`);
    if (name === 'ss') {
      // Frozen forecast calibration slopes for movers and stayers on the 1994-start replay.
      const mv = res.headline['movers.race.frozenSlope.k5'].est;
      const st = res.headline['movers.race.frozenSlopeStayers.k5'].est;
      assert.ok(mv > 0.5 && mv < 0.9 && st > 0.9 && st < 1.2, `frozen-rating slopes: movers ${mv.toFixed(2)}, stayers ${st.toFixed(2)}`);
    }
  }
  // The Elo reference retains its former heads; the published hybrid's refitted heads are checked against their dated fit report.
  const reference = eloForecastScores(prep);
  for (const [window, expected] of Object.entries({ w2: [0.336929, 0.383689, 0.359629], w3: [0.325484, 0.361741, 0.364562] })) {
    const got = reference[window];
    [got.raceDay, got.thursday, got.qual].forEach((value, index) =>
      assert.ok(
        Math.abs(value - expected[index]) < 0.0001,
        `Elo forecast layer ${window}[${index}]: ${value.toFixed(4)} vs 1994-start fixture ${expected[index]}`,
      ),
    );
  }
  const published = deserialize(await readFile('data/model.json', 'utf8')).model;
  const publishedScores = {
    '2008-2011': [0.334276, 0.379471, 0.349188],
    '2012-2015': [0.323467, 0.358329, 0.359751],
  };
  for (const [fromYear, toYear] of [
    [2008, 2011],
    [2012, 2015],
  ]) {
    const summary = summarizeBacktest(published, { burnIn: 20, fromYear, toYear, diag: 'diag' }).overall;
    const actual = [summary.combinedLogLoss, summary.preCombinedLogLoss, summary.qualLogLoss];
    actual.forEach((value, index) =>
      assert.ok(
        Math.abs(value - publishedScores[`${fromYear}-${toYear}`][index]) < 0.0001,
        `published hybrid heads reproduce the ${fromYear}-${toYear} 1994-start fixture`,
      ),
    );
  }
  console.log(
    'PASS real data: 1994-start filter/Elo ratings and published hybrid heads reproduce their fixtures; holdout excluded by default',
  );
}
