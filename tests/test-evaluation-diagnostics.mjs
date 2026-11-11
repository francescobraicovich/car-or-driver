import assert from 'node:assert/strict';
import { findMoves, findTeamChanges, indexTimeline, toyTimeline } from '../packages/eval/src/index.js';
import { situationFlags, situationMetrics } from '../packages/eval/src/situations.js';
import { revisionMetrics } from '../packages/eval/src/diagnostics.js';
import { arrivalImpact, teammateMetrics } from '../packages/eval/src/teammates.js';
import { structuralDiagnostics } from '../packages/eval/src/structural-diagnostics.js';
import { teamPerformance } from '../packages/eval/src/shocks.js';

const identity = { canon: (id) => id, carOf: (id) => id };
const timeline = Array.from({ length: 17 }, (_, i) => ({
  i,
  year: i < 11 ? 2021 : 2022,
  round: i < 11 ? i + 1 : i - 10,
  rows: [
    { driverId: 'a', constructorId: i < 11 ? 'A' : 'B' },
    { driverId: 'b', constructorId: 'B' },
    ...(i >= 11 ? [{ driverId: 'rookie', constructorId: 'C' }] : []),
  ],
  obs: { race: [], qual: [] },
}));
const idx = indexTimeline(timeline, identity);
const flags = situationFlags(idx);
assert.equal(flags[11].get('a').mover, true);
assert.equal(flags[15].get('a').mover, true);
assert.equal(flags[16].get('a').mover, false);
assert.equal(flags[11].get('rookie').rookie, true);
assert.equal(flags[11].get('b').rookie, false);
const row = { i: 11, year: 2022, session: 'race', x: 'a', y: 'b', same: true, wet: true, src: 'finish', logit: 0, o: 1, w: 5 };
const other = { ...row, i: 12, logit: Math.log(4), o: 0, w: 1, src: 'paceW' };
const metrics = situationMetrics(idx, [row, other]);
assert.equal(metrics.race.mover.unweighted.count, 2);
assert.equal(metrics.race.closeTeammates.unweighted.count, 1);
assert.equal(metrics.race.largeFavorite.unweighted.count, 1);
assert.equal(metrics.race.wetRace.unweightedFinish.count, 1);
assert.equal(metrics.race.earlyRegulationSeason.unweighted.count, 2);
assert.notEqual(metrics.race.all.weighted.loss, metrics.race.all.unweighted.loss);
assert.equal(metrics.race.all.unweightedFinish.count, 1);
assert.equal(metrics.race.all.unweighted.calibrationSlope, null);
assert.equal(metrics.qual.all.unweighted, null);

// Changes that do not last the full horizon must not be counted as a teammate event.
const shortChange = {
  valid: true,
  year: 2022,
  team: 'B',
  t0: 11,
  ellT: 10,
  weeksAfter: [11, 12, 13],
  stayers: ['b'],
  incoming: ['a'],
  outgoing: ['c'],
  movers: [{ driverId: 'a', ell: 10 }],
};
const truncatedLineup = { ...idx, lineup: idx.lineup.map((lineup, i) => (i === 12 ? new Map([['B', ['b']]]) : lineup)) };
const emptyRun = { session: 'race', pre: [], post: [] };
assert.equal(teammateMetrics(truncatedLineup, emptyRun, [shortChange], { boot: { B: 0 } }).step[3].n, 0);

// The synthetic league exposes repeatable, non-zero consecutive car revisions.
const toy = toyTimeline({ seasons: 3, races: 14, teams: 8, seed: 3 });
const toyIdx = indexTimeline(toy, identity);
const post = toy.map((weekend, i) => ({
  drivers: new Map(weekend.rows.map((r) => [r.driverId, { m: 0, seen: true }])),
  cars: new Map(weekend.rows.map((r) => [r.constructorId, { m: Number(r.constructorId.replace(/\D/g, '')) * i || i }])),
}));
const revision = revisionMetrics(toyIdx, { post }, { boot: { B: 0 } });
assert.ok(revision.car.n > 0);
assert.ok(revision.car.continuation.est >= 0 && revision.car.continuation.est <= 1);
const combinedRun = {
  session: 'combined',
  performanceSession: 'race',
  k: 1,
  post,
  pre: post.map((snapshot) => ({ drivers: new Map([...snapshot.drivers].map(([id, value]) => [id, value.m])) })),
};
const combinedDiagnostics = structuralDiagnostics(toyIdx, combinedRun, { fromYear: 2000, toYear: 2025, boot: { B: 0 } });
assert.ok(combinedDiagnostics.shocks.n > 0);
assert.ok(Number.isFinite(teamPerformance(toyIdx, combinedRun, toyIdx.teamAt[1].get(toy[1].rows[0].driverId), 1)));

const stableTimeline = Array.from({ length: 26 }, (_, i) => ({
  i,
  year: 2020,
  round: i + 1,
  rows: Array.from({ length: 8 }, (_, d) => ({ driverId: String(d), constructorId: String(Math.floor(d / 2)) })),
  obs: { race: [], qual: [] },
}));
const stableIdx = indexTimeline(stableTimeline, identity);
const newcomerTimeline = stableTimeline.map((weekend) => ({
  ...weekend,
  rows: weekend.rows.map((row) => (weekend.i >= 2 && row.driverId === '1' ? { ...row, driverId: 'new' } : row)),
}));
const newcomerIdx = indexTimeline(newcomerTimeline, identity);
const newcomerRun = {
  post: newcomerTimeline.map((weekend) => ({
    drivers: new Map(weekend.rows.map((row) => [row.driverId, { m: row.driverId === '0' && weekend.i >= 2 ? 10 : 0 }])),
  })),
};
const arrivals = arrivalImpact(newcomerIdx, newcomerRun, findTeamChanges(newcomerIdx, findMoves(newcomerIdx)), { boot: { B: 0 } });
assert.equal(arrivals[3].firstAppearance.n, 1);
assert.equal(arrivals[3].firstAppearance.mean.est, 10);
assert.equal(arrivals[3].other.n, 0);
const revisionsFor = (series) => ({
  post: stableTimeline.map((_, i) => ({
    drivers: new Map(Array.from({ length: 8 }, (_, d) => [String(d), { m: (d % 2 ? 1 : -1) * series(i), seen: true }])),
    cars: new Map(Array.from({ length: 4 }, (_, c) => [String(c), { m: (c % 2 ? 1 : -1) * series(i) }])),
  })),
});
const continuing = revisionMetrics(
  stableIdx,
  revisionsFor((i) => i),
  { boot: { B: 0 } },
);
const reversing = revisionMetrics(
  stableIdx,
  revisionsFor((i) => i % 2),
  { boot: { B: 0 } },
);
assert.equal(continuing.driver.continuation.est, 1);
assert.equal(continuing.car.continuation.est, 1);
assert.equal(reversing.driver.continuation.est, 0);
assert.equal(reversing.car.continuation.est, 0);
assert.equal(reversing.car.reversal.est, 1);
console.log('Evaluation diagnostic tests passed');
