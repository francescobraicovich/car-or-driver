import assert from 'node:assert/strict';
import { chronologicalValidation, pairedDifference } from '../packages/eval/src/chronological-validation.js';

const timeline = [];
for (let year = 2002; year <= 2009; year++) {
  const obs = Array.from({ length: 30 }, (_, i) => ({ x: String(i), y: String(i + 1), o: i % 2, w: 1, same: i % 3 === 0 }));
  timeline.push({ year, obs: { race: obs, qual: obs } });
}
const idx = { timeline };
const run = (session) => ({
  session,
  z: timeline.map((w) => ({ adj: w.obs[session].map((o) => (o.o ? 1 : -1)), plain: w.obs[session].map(() => 1) })),
});
const runs = { race: run('race'), qual: run('qual') };
const moverRows = Object.fromEntries(
  ['race', 'qual'].map((session) => [
    session,
    Object.fromEntries(
      [5, 10].map((horizon) => [
        horizon,
        {
          stayers: timeline.flatMap((w) => w.obs[session].map((o) => ({ year: w.year, z: o.o ? 1 : -1, o: o.o, w: o.w }))),
          items: timeline.flatMap((w) =>
            w.obs[session].map((o, i) => ({
              year: w.year,
              z: o.o ? 1 : -1,
              o: o.o,
              w: o.w,
              kind: i % 2 ? 'tm' : 'fd',
              driverId: String(i),
              t0: w.year,
            })),
          ),
        },
      ]),
    ),
  ]),
);
const folds = [{ from: 2008, to: 2009 }];
const result = chronologicalValidation(idx, runs, moverRows, folds);
assert.equal(result.folds[0].sessions.race.all.accuracy, 1, 'weighted accuracy counts correct predictions');
const previousLogit = runs.race.z[6].adj[0];
runs.race.z[6].adj[0] = 0;
assert.equal(
  chronologicalValidation(idx, runs, moverRows, folds).folds[0].sessions.race.all.accuracy,
  59.5 / 60,
  'a tied probability receives half a correct prediction',
);
runs.race.z[6].adj[0] = previousLogit;
const original = result.folds[0].sessions.race.slope;
runs.race.z.at(-1).adj.fill(-2);
assert.equal(chronologicalValidation(idx, runs, moverRows, folds).folds[0].sessions.race.slope, original);
assert.equal(pairedDifference(result.forecasts, result.forecasts, (row) => row.year).est, 0);
assert.throws(
  () =>
    chronologicalValidation(idx, runs, moverRows, [
      { from: 2008, to: 2009 },
      { from: 2009, to: 2010 },
    ]),
  /ordered and disjoint/,
);
runs.race.z[0].adj[0] = NaN;
assert.throws(() => chronologicalValidation(idx, runs, moverRows, folds), /invalid observation/);
assert.throws(() => pairedDifference(result.forecasts, result.forecasts.slice(1), (row) => row.year), /do not match/);
const damaged = result.forecasts.map((row) => ({ ...row }));
damaged[0].x = 'different';
assert.throws(() => pairedDifference(result.forecasts, damaged, (row) => row.year), /differ/);
const moverReference = [
  {
    year: 2008,
    observationYear: 2008,
    weekendIndex: 1,
    observationIndex: 4,
    driverId: '1',
    t0: 0,
    session: 'race',
    horizon: 5,
    kind: 'fd',
    o: 1,
    w: 1,
    logit: 1,
  },
];
const moverCandidate = [{ ...moverReference[0], observationIndex: 5 }];
assert.throws(() => pairedDifference(moverReference, moverCandidate, (row) => row.driverId), /observationIndex/);
assert.throws(() => chronologicalValidation(idx, { race: runs.race }, moverRows, folds), /invalid observation|Missing qual/);
const priorStayerSlope = result.folds[0].movers.qual[5].stayerSlope;
for (const item of moverRows.qual[5].stayers.filter((row) => row.year >= 2008)) item.z = -item.z;
runs.race.z[0].adj[0] = 1;
assert.equal(chronologicalValidation(idx, runs, moverRows, folds).folds[0].movers.qual[5].stayerSlope, priorStayerSlope);

const late = moverRows.race[5].items.find((row) => row.year === 2009);
late.observationYear = 2010;
assert.equal(
  chronologicalValidation(idx, runs, moverRows, folds).folds[0].movers.race[5].field.count,
  result.folds[0].movers.race[5].field.count - 1,
);
const sparse = structuredClone(moverRows);
sparse.race[5].items = sparse.race[5].items.filter((row) => row.year < 2008);
sparse.qual[10].stayers = sparse.qual[10].stayers.slice(0, 3);
const monitoring = chronologicalValidation(idx, runs, sparse, folds, { allowUnavailable: true });
assert.equal(monitoring.folds[0].movers.race[5].teammate, null);
assert.equal(monitoring.folds[0].movers.race[5].field, null);
assert.equal(monitoring.folds[0].movers.qual[10].teammate, null);
assert.ok(monitoring.folds[0].movers.qual[10].field);
sparse.race[10].items.find((row) => row.year === 2008).w = NaN;
assert.throws(() => chronologicalValidation(idx, runs, sparse, folds, { allowUnavailable: true }), /invalid observation/);
const futureEligibility = structuredClone(moverRows);
const delayed = futureEligibility.race[5].items.find((row) => row.year === 2008 && row.kind === 'tm');
delayed.eligibilityYear = 2010;
assert.equal(
  chronologicalValidation(idx, runs, futureEligibility, folds).folds[0].movers.race[5].teammate.count,
  result.folds[0].movers.race[5].teammate.count - 1,
);
console.log('Chronological validation tests passed');
