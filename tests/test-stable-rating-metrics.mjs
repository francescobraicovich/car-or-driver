import assert from 'node:assert/strict';
import { moverReport, stabilityReport } from '../research/stable-ratings/metrics.mjs';
import { nll } from '../packages/eval/src/stats.js';

const rows = [];
for (const session of ['race', 'qual'])
  for (const horizon of [5, 10])
    for (const kind of ['tm', 'fd']) {
      for (const [driverId, count] of [
        ['a', 1],
        ['b', 4],
        ['c', 1],
      ]) {
        for (let i = 0; i < count; i++)
          rows.push({
            year: 2008,
            observationYear: 2008,
            weekendIndex: i,
            observationIndex: i,
            driverId,
            t0: driverId,
            session,
            horizon,
            kind,
            o: 1,
            w: 1,
            logit: 0,
          });
      }
    }
const candidate = rows.map((row) => ({ ...row, logit: row.driverId === 'a' ? 2 : 0 }));
const folds = [{ from: 2008, to: 2008 }];
const report = moverReport({ movers: rows }, { movers: candidate }, { folds, bootstrap: { B: 100, seed: 2 } }).pooled;
const expected = (nll(2, 1) - nll(0, 1)) / 3;
assert.ok(Math.abs(report.primary.difference.est - expected) < 1e-12);
assert.ok(Math.abs(report.cells['race.5.tm'].difference.est - expected) < 1e-12);
assert.notEqual(report.cells['race.5.tm'].rowWeightedCandidate - report.cells['race.5.tm'].rowWeightedReference, expected);
assert.equal(report.cells['race.5.tm'].moves, 3);
assert.equal(report.cells['race.5.tm'].observations, 6);
assert.ok(report.primary.difference.lo < report.primary.difference.hi);
const fieldOnly = { ...rows.find((row) => row.kind === 'fd'), driverId: 'field-only', t0: 'field-only' };
const withFieldOnly = moverReport(
  { movers: [...rows, fieldOnly] },
  { movers: [...candidate, fieldOnly] },
  { folds, bootstrap: { B: 100, seed: 2 } },
).pooled;
assert.equal(withFieldOnly.moves, 4);
assert.equal(withFieldOnly.primary.moves, 3);
assert.equal(withFieldOnly.primary.difference.clusters, 3);
assert.equal(withFieldOnly.primary.difference.est, report.primary.difference.est);
assert.equal(withFieldOnly.primary.difference.lo, report.primary.difference.lo);
assert.equal(withFieldOnly.primary.difference.hi, report.primary.difference.hi);
assert.throws(() => moverReport({ movers: rows }, { movers: candidate.slice(1) }, { folds }), /do not match/);
const mismatched = candidate.map((row) => ({ ...row }));
mismatched[0].observationIndex = 9;
assert.throws(() => moverReport({ movers: rows }, { movers: mismatched }, { folds }), /differ/);

const idx = {
  timeline: [{ year: 2008 }, { year: 2008 }, { year: 2009 }, { year: 2009 }],
  appear: new Map([
    [
      'a',
      [
        { i: 0, team: 'A' },
        { i: 1, team: 'A' },
        { i: 2, team: 'A' },
        { i: 3, team: 'B' },
      ],
    ],
  ]),
};
const post = [0, 10, 4, 12];
const run = {
  pre: post.map((value) => ({ rated: new Map([['a', value - 1]]) })),
  post: post.map((value) => ({ drivers: new Map([['a', { m: value }]]) })),
};
const stability = stabilityReport(idx, run, { from: 2008, to: 2009 });
assert.equal(stability.postToPost.categories.all.observations, 3);
assert.equal(stability.postToPost.categories.all.reversalRate, 1);
assert.equal(stability.postToPost.categories.all.vShapeAtLeast5, 2);
assert.equal(stability.postToPost.categories.seasonBoundary.observations, 1);
assert.equal(stability.postToPost.categories.teamChange.observations, 1);
assert.equal(stability.postToPost.categories.withinSeason.observations, 2);
assert.equal(stability.preToPost.categories.all.median, 7);
const shifted = {
  ...run,
  pre: run.pre.map((snapshot) => ({ rated: new Map([...snapshot.rated].map(([id, value]) => [id, value + 500])) })),
};
const shiftedStability = stabilityReport(idx, shifted, { from: 2008, to: 2009 });
assert.deepEqual(shiftedStability.preToPost, stability.preToPost);
assert.deepEqual(shiftedStability.postToPost, stability.postToPost);
const pointOnly = stabilityReport(idx, run, { from: 2008, to: 2009, bootstrap: { B: 0 } });
assert.equal(pointOnly.preToPost.categories.all.p90, stability.preToPost.categories.all.p90);
assert.equal(pointOnly.preToPost.categories.all.p90SeasonInterval, null);
assert.equal(stability.postToPost.commonShift.weekends, 3);
const scaleTimeline = [2008, 2008, 2008].map((year) => ({ year, rows: [{ driverId: 'a' }, { driverId: 'b' }] }));
const scaleIdx = {
  timeline: scaleTimeline,
  appear: new Map(['a', 'b'].map((driverId) => [driverId, scaleTimeline.map((_, i) => ({ i, team: 'A' }))])),
};
const makeRun = (factor) => {
  const snapshots = [
    [-10, 10],
    [-8, 8],
    [-6, 6],
  ];
  return {
    pre: snapshots.map(([a, b]) => ({
      rated: new Map([
        ['a', a * factor],
        ['b', b * factor],
      ]),
    })),
    post: snapshots.map(([a, b]) => ({
      drivers: new Map([
        ['a', { m: a * factor }],
        ['b', { m: b * factor }],
      ]),
    })),
  };
};
const full = stabilityReport(scaleIdx, makeRun(1), { from: 2008, to: 2008, bootstrap: { B: 0 } }).postToPost;
const half = stabilityReport(scaleIdx, makeRun(0.5), { from: 2008, to: 2008, bootstrap: { B: 0 } }).postToPost;
assert.equal(half.categories.all.median, full.categories.all.median / 2);
assert.equal(half.normalizedByFieldSpread.categories.all.median, full.normalizedByFieldSpread.categories.all.median);
assert.equal(half.normalizedByFieldSpread.medianFieldSD, full.normalizedByFieldSpread.medianFieldSD / 2);
const zero = stabilityReport(scaleIdx, makeRun(0), { from: 2008, to: 2008, bootstrap: { B: 0 } }).postToPost.normalizedByFieldSpread;
assert.equal(zero.categories.all.observations, 0);
assert.equal(zero.categories.all.unavailable, 4);
assert.ok(Number.isNaN(zero.categories.all.median));
console.log('Stable rating metrics tests passed');
