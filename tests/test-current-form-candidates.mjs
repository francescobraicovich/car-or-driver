import assert from 'node:assert/strict';
import { FormFeatures } from '../packages/core/src/forecast/form.js';
import { ContinuousFormFeatures, InnovationFormFeatures, CombinedFormFeatures } from '../research/current-form/form-candidates.mjs';

const rows = [
  { driverId: 'a', constructorId: 'X', laps: 50, positionOrder: 1, statusName: 'Finished' },
  { driverId: 'b', constructorId: 'X', laps: 50, positionOrder: 2, statusName: 'Finished' },
  { driverId: 'c', constructorId: 'Y', laps: 50, positionOrder: 3, statusName: 'Finished' },
  { driverId: 'd', constructorId: 'Y', laps: 50, positionOrder: 4, statusName: 'Finished' },
];
const info = (raceId = '1', year = 2024) => ({ raceId, year, round: 1, circuitId: 'c' });
const maps = (driverGap = 0) => ({
  D: new Map(rows.map((r, i) => [r.driverId, i === 0 ? driverGap : 0])),
  C: new Map([
    ['X', 0],
    ['Y', 0],
  ]),
  QD: new Map(rows.map((r, i) => [r.driverId, i === 0 ? driverGap : 0])),
  QC: new Map([
    ['X', 0],
    ['Y', 0],
  ]),
  raceSeen: new Map(),
});
const weekend = (currentRows = rows, year = 2024, driverGap = 0) => ({
  info: info('1', year),
  rows: currentRows,
  qrows: [],
  ...maps(driverGap),
});
const finish = (x, y, outcome = 1, base = 12) => ({ session: 'race', ob: { x, y, obs: outcome, source: 'finish', base, gap: 1 } });
const partial = (x, y, outcome = 1, base = 0.25) => ({ session: 'race', ob: { x, y, obs: outcome, source: 'partial', base, gap: 1 } });
const feature = (form, x = rows[0], y = rows[1]) => form.features(x, y, 'race', 0.5, 0.5);
const advance = (form, observations, currentRows = rows) => {
  form.beforeWeekend(weekend(currentRows));
  form.afterWeekend({ info: info(), rows: currentRows, replayObs: observations });
};
const read = (form) => form.exportState().forms.order_fast;

for (const Type of [ContinuousFormFeatures, InnovationFormFeatures, CombinedFormFeatures]) {
  const f = new Type(null);
  const w = weekend();
  f.beforeWeekend(w);
  const before = feature(f);
  f.afterWeekend({ info: info(), rows, replayObs: [finish(rows[0], rows[1])] });
  assert.equal(feature(f).order_fast_driver, before.order_fast_driver, 'same-weekend forecast uses the captured pre-result state');
  f.beforeWeekend(w);
  const after = feature(f);
  assert(after.order_fast_driver > 0, 'teammate win moves driver form');
  assert.equal(after.order_fast_car, 0, 'teammates have the same car form');
  const reverse = feature(f, rows[1], rows[0]);
  assert(Math.abs(after.order_fast + reverse.order_fast) < 1e-12);
  assert(Math.abs(after.order_fast_driver + reverse.order_fast_driver) < 1e-12);
  const checkpoint = f.exportState();
  const initialValue = checkpoint.forms.order_fast.d.get('a');
  const innovationValue = checkpoint.innovationForms?.order_fast.d.get('a');
  f.afterWeekend({ info: info(), rows, replayObs: [finish(rows[1], rows[0])] });
  assert.equal(checkpoint.forms.order_fast.d.get('a'), initialValue, 'checkpoint maps are independent');
  if (checkpoint.innovationForms)
    assert.equal(checkpoint.innovationForms.order_fast.d.get('a'), innovationValue, 'combined innovation checkpoint is independent');
  const restored = new Type(null);
  restored.importState(checkpoint);
  assert.deepEqual(restored.exportState(), checkpoint);
  assert.throws(() => restored.importState({ ...checkpoint, method: 'invalid' }), /method/);
  if (Type === CombinedFormFeatures) assert('innovation_order_fast_driver' in after && 'innovation_order_fast_car' in after);
}

const qualifyingWeekend = {
  ...weekend(),
  qrows: [
    { ...rows[0], q1: '1:20.000', q2: '\\N', q3: '\\N', position: 1 },
    { ...rows[1], q1: '1:21.000', q2: '\\N', q3: '\\N', position: 2 },
  ],
};
const legacy = new FormFeatures(null, { track: false });
const candidate = new CombinedFormFeatures(null);
legacy.beforeWeekend(qualifyingWeekend);
candidate.beforeWeekend(qualifyingWeekend);
const inherited = legacy.features(rows[0], rows[1], 'race', 0.5, 0.5);
const current = candidate.features(rows[0], rows[1], 'race', 0.5, 0.5);
for (const key of Object.keys(inherited))
  assert.equal(current[key], inherited[key], `existing current-qualifying feature ${key} is unchanged`);

// An existing car form is unidentifiable from an intra-team duel. The
// continuous ridge design must leave the aged car prior untouched.
for (const Type of [ContinuousFormFeatures, CombinedFormFeatures]) {
  const form = new Type(null);
  const initial = form.exportState();
  initial.forms.order_fast.c.set('X', 2);
  form.importState(initial);
  form.beforeWeekend(weekend());
  const carBefore = form.exportState().forms.order_fast.c.get('X');
  form.afterWeekend({ info: info(), rows, replayObs: [finish(rows[0], rows[1])] });
  const state = form.exportState().forms.order_fast;
  assert.equal(state.c.get('X'), carBefore, 'teammate-only evidence cannot change car form');
  assert(state.d.get('a') > state.d.get('b'), 'teammate result moves the driver contrast');
  assert(Math.abs(state.d.get('a') + state.d.get('b')) < 1e-12, 'new driver information contains no common-team shift');
  const reverseForm = new Type(null);
  reverseForm.importState(initial);
  reverseForm.beforeWeekend(weekend());
  reverseForm.afterWeekend({ info: info(), rows, replayObs: [finish(rows[1], rows[0])] });
  const reverseState = reverseForm.exportState().forms.order_fast;
  assert(reverseState.d.get('a') < reverseState.d.get('b'), 'reversing the result reverses the driver contrast');
  assert.equal(reverseState.c.get('X'), carBefore);
}

// Four cross-team comparisons reinforce a shared team result; the shared
// car component cancels within teammates and has the correct orientation.
const team = new InnovationFormFeatures(null);
advance(team, [finish(rows[0], rows[2]), finish(rows[0], rows[3]), finish(rows[1], rows[2]), finish(rows[1], rows[3])]);
const teamState = read(team);
assert(teamState.c.get('X') > 0 && teamState.c.get('Y') < 0);
team.beforeWeekend(weekend());
assert(feature(team, rows[0], rows[2]).order_fast_car > 0);
assert.equal(feature(team, rows[0], rows[1]).order_fast_car, 0);

const stateAfter = (Type, observations, driverGap = 0, currentRows = rows) => {
  const f = new Type(null);
  f.beforeWeekend(weekend(currentRows, 2024, driverGap));
  f.afterWeekend({ info: info(), rows: currentRows, replayObs: observations });
  return f;
};
const expected = stateAfter(InnovationFormFeatures, [finish(rows[0], rows[2])], 75);
const upset = stateAfter(InnovationFormFeatures, [finish(rows[0], rows[2], 0)], 75);
assert(Math.abs(read(upset).d.get('a')) > Math.abs(read(expected).d.get('a')), 'upsets have greater innovation against a strong prior');
const strong = stateAfter(InnovationFormFeatures, [partial(rows[0], rows[2], 1, 1)]);
const weak = stateAfter(InnovationFormFeatures, [partial(rows[0], rows[2], 1, 0.25)]);
assert(read(strong).d.get('a') > read(weak).d.get('a'), 'lower coverage carries less support');
const duplicate = stateAfter(InnovationFormFeatures, [finish(rows[0], rows[2]), finish(rows[0], rows[2])]);
const single = stateAfter(InnovationFormFeatures, [finish(rows[0], rows[2])]);
assert.deepEqual(duplicate.exportState(), single.exportState(), 'duplicate pairs do not inflate evidence');
for (const Type of [ContinuousFormFeatures, InnovationFormFeatures, CombinedFormFeatures]) {
  const observations = [finish(rows[0], rows[2])];
  const unique = stateAfter(Type, observations);
  const repeatedRow = stateAfter(Type, observations, 0, [...rows, { ...rows[1] }]);
  assert.deepEqual(repeatedRow.exportState(), unique.exportState(), 'duplicate entrant rows cannot dilute form evidence');
}
const conflicting = stateAfter(InnovationFormFeatures, [finish(rows[0], rows[2]), finish(rows[2], rows[0])]);
assert.equal(read(conflicting).d.size, 0, 'equally supported conflicts are excluded');
const mechanical = stateAfter(InnovationFormFeatures, []);
assert.equal(read(mechanical).d.size, 0, 'retirement without pace is not a loss');
const parade = rows.map((row) => ({ ...row, laps: 1 }));
const stopped = stateAfter(InnovationFormFeatures, [finish(parade[0], parade[2])], 0, parade);
assert.equal(read(stopped).d.size, 0, 'one-lap race is excluded');

// A mechanical retirement still contributes valid overlapping lap pace, but
// no finishing defeat. Evidence has exactly the supplied overlap coverage.
const pace = new Map([
  [
    '1',
    new Map([
      ['a', { n: 8, med: 80, win: [{ s: 1, n: 8, med: 80 }] }],
      ['c', { n: 8, med: 81, win: [{ s: 1, n: 8, med: 81 }] }],
    ]),
  ],
]);
const retiredRows = rows.map((row, index) => (index === 0 ? { ...row, statusName: 'Engine', laps: 12 } : row));
const lapForm = new CombinedFormFeatures(pace);
lapForm.beforeWeekend(weekend(retiredRows));
lapForm.afterWeekend({
  info: info(),
  rows: retiredRows,
  replayObs: [
    {
      session: 'race',
      ob: {
        x: retiredRows[0],
        y: retiredRows[2],
        obs: 1,
        source: 'paceW',
        base: 0.375,
        gapSec: 1,
      },
    },
  ],
});
const lapState = lapForm.exportState();
assert(lapState.forms.lap_fast.d.get('a') > 0 && lapState.innovationForms.lap_fast.d.get('a') > 0);
assert.equal(lapState.forms.order_fast.d.size, 0, 'mechanical failure creates no order loss');

// Identical pairs with reversed row orientation produce the same checkpoint.
const forward = stateAfter(InnovationFormFeatures, [finish(rows[0], rows[2])]);
const reversed = stateAfter(InnovationFormFeatures, [finish(rows[2], rows[0], 0)]);
assert.deepEqual(forward.exportState(), reversed.exportState(), 'pair orientation cannot change learning');
const prefix = forward.exportState();
forward.beforeWeekend(weekend());
forward.afterWeekend({ info: info(), rows, replayObs: [finish(rows[2], rows[0])] });
assert.deepEqual(prefix, single.exportState(), 'future results cannot rewrite a prior checkpoint');

const old = team.exportState();
const oldDriver = old.forms.order_fast.d.get('a'),
  oldCar = old.forms.order_fast.c.get('X');
for (let i = 0; i < 10; i++) {
  team.beforeWeekend(weekend());
  team.afterWeekend({ info: info(), rows, replayObs: [] });
}
const aged = team.exportState();
assert(Math.abs(aged.forms.order_fast.d.get('a') / oldDriver - 0.5) < 1e-12);
assert(Math.abs(aged.forms.order_fast.c.get('X') / oldCar - 0.5) < 1e-12);
const winter = new InnovationFormFeatures(null);
winter.importState(old);
winter.beforeWeekend(weekend(rows, 2026));
assert(Math.abs(winter.exportState().forms.order_fast.d.get('a') / oldDriver - 2 ** (-1 / 10) * 0.65 ** 2) < 1e-12);

const stayed = new InnovationFormFeatures(null),
  movedForm = new InnovationFormFeatures(null);
stayed.importState(old);
movedForm.importState(old);
const movedRows = rows.map((row) => (row.driverId === 'a' ? { ...row, constructorId: 'Y' } : row));
stayed.beforeWeekend(weekend(rows));
movedForm.beforeWeekend(weekend(movedRows));
assert.deepEqual(stayed.exportState(), movedForm.exportState(), 'a move has no special aging or driver reset');

const identity = new InnovationFormFeatures(null);
const saved = identity.exportState();
saved.forms.order_fast.d.set('a', 1);
saved.forms.order_fast.c.set('10', 2);
identity.importState(saved);
identity.beforeWeekend(weekend());
const driver = { driverId: 'a', constructorId: '211' },
  renamed = { driverId: 'b', constructorId: '10' },
  takeover = { driverId: 'c', constructorId: '131' };
const renamedFeature = feature(identity, driver, renamed);
assert.equal(renamedFeature.order_fast_car, 0, 'renamed cars share the same lineage');
assert(renamedFeature.order_fast_driver > 0, 'driver form follows driver identity');
assert(feature(identity, driver, takeover).order_fast_car > 0, 'a takeover starts a distinct car state');
console.log('PASS current-form candidate causality, attribution, aging, transfer and checkpoints');
