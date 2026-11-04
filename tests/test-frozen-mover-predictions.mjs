import assert from 'node:assert/strict';
import { strictItems } from '../packages/research/node/mover-strict.mjs';
import { chronologicalValidation } from '../packages/eval/src/chronological-validation.js';
import { moverReport } from '../research/stable-ratings/metrics.mjs';

const calibration = Array.from({ length: 40 }, (_, i) => ({
  x: 'a',
  y: 'b',
  cx: 'old',
  cy: 'other',
  same: i % 2 === 0,
  o: i % 3 === 0 ? 0 : 1,
  w: 1,
}));
const duels = [
  { x: 'mover', y: 'mate', cx: 'new', cy: 'new', same: true, o: 1, w: 1 },
  { x: 'mover', y: 'field', cx: 'new', cy: 'field', same: false, o: 1, w: 1 },
];
const timeline = Array.from({ length: 11 }, (_, i) => ({
  year: i === 0 ? 2007 : 2008,
  obs: { race: i === 0 ? calibration : duels, qual: i === 0 ? calibration : duels },
}));
const idx = { timeline };
const moves = [{ valid: true, driverId: 'mover', ell: 0, t0: 1, year: 2008, apps: Array.from({ length: 10 }, (_, i) => ({ i: i + 1 })) }];
const createRun = (session) => ({
  session,
  k: 0.03,
  pre: timeline.map(() => ({
    rated: new Map([
      ['mover', 20],
      ['mate', 0],
      ['field', -10],
    ]),
    cars: new Map([
      ['new', 5],
      ['field', 0],
    ]),
  })),
  post: timeline.map(() => ({
    drivers: new Map([
      ['mover', { m: 20 }],
      ['mate', { m: 0 }],
    ]),
  })),
  z: timeline.map((weekend) => ({
    adj: weekend.obs[session].map((row) => (row.o ? 0.5 : -0.2)),
    plain: weekend.obs[session].map(() => 0.5),
  })),
});
const runs = { race: createRun('race'), qual: createRun('qual') };
const stayers = Array.from({ length: 40 }, (_, i) => ({ year: 2007, z: i % 3 === 0 ? -0.4 : 0.4, o: i % 4 === 0 ? 0 : 1, w: 1 }));
const evaluate = () => {
  const rows = Object.fromEntries(
    ['race', 'qual'].map((session) => [
      session,
      Object.fromEntries([5, 10].map((horizon) => [horizon, { items: strictItems(idx, runs[session], moves, horizon), stayers }])),
    ]),
  );
  return chronologicalValidation(idx, runs, rows, [{ from: 2008, to: 2008 }]);
};
const initial = evaluate();
const primary = (result) =>
  moverReport(result, result, { folds: [{ from: 2008, to: 2008 }], bootstrap: { B: 0 } }).pooled.primary.reference;
const teammate = (result, session, horizon) =>
  result.movers.filter((row) => row.kind === 'tm' && row.session === session && row.horizon === horizon);
for (const session of ['race', 'qual'])
  for (let i = 1; i < timeline.length; i++) {
    runs[session].pre[i].rated.set('mover', -10000 - i).set('mate', 10000 + i);
    runs[session].post[i].drivers.get('mover').m = 90000 + i;
    runs[session].post[i].drivers.get('mate').m = -90000 - i;
  }
// A future stayer observation must not alter the calibration used in this fold.
stayers.push({ year: 2008, z: -999, o: 1, w: 1 });
const changedAfterMove = evaluate();
for (const session of ['race', 'qual'])
  for (const horizon of [5, 10]) {
    assert.deepEqual(teammate(changedAfterMove, session, horizon), teammate(initial, session, horizon));
    assert.equal(changedAfterMove.folds[0].movers[session][horizon].stayerSlope, initial.folds[0].movers[session][horizon].stayerSlope);
  }
assert.equal(primary(changedAfterMove), primary(initial));
for (const session of ['race', 'qual']) runs[session].pre[0].rated.set('mover', 35);
const changedPrior = evaluate();
for (const session of ['race', 'qual'])
  for (const horizon of [5, 10])
    assert.notEqual(teammate(changedPrior, session, horizon)[0].logit, teammate(initial, session, horizon)[0].logit);
assert.notEqual(primary(changedPrior), primary(initial));
for (const session of ['race', 'qual']) runs[session].pre[0].rated.set('mate', 12);
const changedPriorTeammate = evaluate();
for (const session of ['race', 'qual'])
  for (const horizon of [5, 10])
    assert.notEqual(teammate(changedPriorTeammate, session, horizon)[0].logit, teammate(changedPrior, session, horizon)[0].logit);
assert.notEqual(primary(changedPriorTeammate), primary(changedPrior));
console.log('Frozen mover prediction tests passed');
