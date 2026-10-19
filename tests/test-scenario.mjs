// "What if" matchups: moment resolution, and a scenario built from today's parts must agree
// with the live forecast's ratings.
import assert from 'node:assert/strict';
import { loadData } from '../packages/research/node/common.mjs';
import { buildEloForecast } from '../packages/core/src/elo-forecast.js';
import { forecastPair } from '../packages/core/src/forecast/prepare.js';
import { resolveMoment, scenarioForecast, RATINGS_SCALE } from '../packages/core/src/forecast/scenario.js';

// 1) Moments on a synthetic career.
{
  const pts = [10, 12, 30, 32, 31, 11, 9].map((race, i) => ({
    race,
    qual: race,
    q: 0.001,
    raceId: String(i),
    year: 2000 + i,
    name: `GP ${i}`,
    date: `${2000 + i}-06-01`,
  }));
  assert.equal(resolveMoment(pts).points.length, 1);
  assert.equal(resolveMoment(pts).race, 9, 'latest is the last appearance');
  assert.equal(resolveMoment(pts, { kind: 'date', date: '2003-12-31' }).race, 32, 'a date takes the last weekend on or before it');
  const early = resolveMoment(pts, { kind: 'date', date: '1990-01-01' });
  assert.equal(early.race, 10);
  assert.ok(early.note, 'a date before the career is clamped and says so');
  const late = resolveMoment(pts, { kind: 'date', date: '2030-01-01' });
  assert.equal(late.race, 9);
  assert.ok(late.note, 'a date long after the career is clamped and says so');
  const prime = resolveMoment(pts, { kind: 'prime' });
  assert.deepEqual(
    prime.points.map((p) => p.race),
    [32],
    'prime is the weekend with the highest rating',
  );
  assert.ok(prime.race >= resolveMoment(pts).race, 'a prime is never below the most recent rating');
  assert.equal(resolveMoment([], { kind: 'prime' }), null);
}

// 2) Real model.
const ctx = await loadData('data');
const model = buildEloForecast(ctx.raw, ctx.lapSnapshots, ctx.maps, {}, ctx.lapPace);
const latest = model.snaps.at(-1);
const [first, second] = latest.drivers;
const id = (d) => String(d.driverId);
const now = (d) => ({ driverId: id(d), when: { kind: 'latest' }, carId: '' });

// A scenario made of today's parts reproduces the live forecast's ratings step exactly.
{
  const live = forecastPair(model, id(first), id(second));
  const s = scenarioForecast(model, now(first), now(second));
  assert.ok(!s.error, s.error);
  assert.ok(Math.abs(s.gap - live.gap) < 1e-9, 'same rating gap as the live forecast');
  assert.ok(Math.abs(s.pPace - live.breakdown.ratings) < 1e-12, 'same ratings-only probability');
  assert.ok(
    Math.abs(s.p - 1 / (1 + Math.exp(-RATINGS_SCALE.cars * Math.log(s.prior / (1 - s.prior))))) < 1e-12,
    'recalibration is the stated scale',
  );
  assert.equal(Math.sign(s.p - 0.5), Math.sign(live.p - 0.5), 'agrees with the live forecast on who is ahead');
  assert.ok(Math.abs(s.p - live.p) < 0.25, `and is in its neighbourhood (${s.p.toFixed(3)} vs ${live.p.toFixed(3)})`);
  // symmetric
  const r = scenarioForecast(model, now(second), now(first));
  assert.ok(Math.abs(s.p + r.p - 1) < 1e-6, 'swapping the sides flips the probability');
  // a driver against themselves in the same car is a coin toss
  const same = scenarioForecast(model, now(first), now(first));
  assert.ok(Math.abs(same.p - 0.5) < 1e-9, 'same driver, same moment, same car: 50%');
}

// A prime is never below today's rating, for every driver on the grid and every car.
for (const d of latest.drivers) {
  const pts = model.dh.get(id(d));
  assert.ok(resolveMoment(pts, { kind: 'prime' }).race >= resolveMoment(pts).race - 1e-9, `${d.name}: prime >= latest`);
}
for (const c of latest.cars) {
  const pts = model.ch.get(String(c.constructorId));
  assert.ok(resolveMoment(pts, { kind: 'prime' }).race >= resolveMoment(pts).race - 1e-9, `${c.name}: prime >= latest`);
}

// Cross-car and cross-time scenarios.
const find = (needle) => [...model.dname].find(([, name]) => name.includes(needle))?.[0];
const hamilton = find('Hamilton');
const alonso = find('Alonso');
assert.ok(hamilton && alonso, 'known drivers present');
{
  const prime = scenarioForecast(
    model,
    { driverId: hamilton, when: { kind: 'prime' }, carId: '' },
    { driverId: alonso, when: { kind: 'prime' }, carId: '' },
  );
  assert.ok(!prime.error, prime.error);
  assert.ok(prime.p > 0 && prime.p < 1 && Number.isFinite(prime.gap), 'prime against prime is a finite probability');
  // The same car at the same date for both: only the driver gap remains.
  const carId = prime.a.constructorId;
  const carWhen = { kind: 'date', date: prime.a.car.to };
  const swapped = scenarioForecast(
    model,
    { driverId: hamilton, when: { kind: 'prime' }, carId, carWhen },
    { driverId: alonso, when: { kind: 'prime' }, carId, carWhen },
  );
  assert.ok(!swapped.error, swapped.error);
  assert.ok(Math.abs(swapped.components.car) < 1e-9, 'identical car and moment: no car gap');
  assert.ok(swapped.sameCar, 'recognised as a same-car comparison');
  // The same driver at two moments is a valid matchup.
  const self = scenarioForecast(
    model,
    { driverId: hamilton, when: { kind: 'date', date: '2008-12-01' }, carId: '' },
    { driverId: hamilton, when: { kind: 'prime' }, carId: '' },
  );
  assert.ok(!self.error && self.p > 0 && self.p < 1, 'a driver against an earlier self');
}

// A car that did not exist at that date is refused with a reason.
{
  const rbr = [...model.cname].find(([, n]) => n.includes('Red Bull'))?.[0];
  const e = scenarioForecast(
    model,
    { driverId: alonso, when: { kind: 'date', date: '2002-06-01' }, carId: rbr, carWhen: { kind: 'same' } },
    now(second),
  );
  assert.ok(e.error && /did not race then/.test(e.error), `refused: ${e.error}`);
}

// Wet: the wet-skill gap enters only when wet, and wet forecasts are pulled toward 50%.
{
  const skill = (d) => model.wetFinal.get(id(d)) ?? 0;
  const pairs = latest.drivers.flatMap((a) => latest.drivers.map((b) => [a, b])).filter(([a, b]) => id(a) !== id(b));
  const [a, b] = pairs.find(([x, y]) => Math.abs(skill(x) - skill(y)) > 5) || pairs[0];
  const dry = scenarioForecast(model, now(a), now(b), { wet: false });
  const wet = scenarioForecast(model, now(a), now(b), { wet: true });
  assert.equal(dry.components.wet, 0);
  assert.ok(Math.abs(wet.components.wet - (skill(a) - skill(b))) < 1e-9, 'wet adds the wet-skill gap');
  const flat = pairs.find(([x, y]) => Math.abs(skill(x) - skill(y)) < 1e-9);
  if (flat) {
    const d0 = scenarioForecast(model, now(flat[0]), now(flat[1]));
    const w0 = scenarioForecast(model, now(flat[0]), now(flat[1]), { wet: true });
    assert.ok(Math.abs(w0.p - 0.5) < Math.abs(d0.p - 0.5), 'with equal wet skill, a wet forecast is closer to 50% than the dry one');
  }
  const spread = [...model.wetFinal.values()];
  console.log(`wet skill: ${spread.length} drivers, range ${Math.min(...spread).toFixed(0)} to ${Math.max(...spread).toFixed(0)} points`);
}
console.log("PASS scenarios: moments resolve, today's parts match the live forecast, wet and cross-car matchups behave");
