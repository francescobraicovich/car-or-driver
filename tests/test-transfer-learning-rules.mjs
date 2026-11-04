import assert from 'node:assert/strict';
import { STATE_SPACE_DEFAULTS, runStateSpace } from '../packages/core/src/state-space/filter.js';
import { STATE_SPACE } from '../packages/core/src/presets/state-space.js';
import { runSession } from '../packages/core/src/state-space/build.js';

const a = { driverId: 'a', constructorId: 'X' };
const b = { driverId: 'b', constructorId: 'X' };
const pair = { x: 'a', y: 'b', cx: 'X', cy: 'X', o: 1, w: 8, same: true, src: 'finish' };
const first = { year: 2024, rows: [a, b], raceObs: [pair], qualObs: [{ ...pair, src: 'qual' }] };
const follow = (moved) => ({ year: 2024, rows: [moved ? { ...a, constructorId: 'Y' } : a, b], raceObs: [], qualObs: [] });
for (const [session, oldJump] of [
  ['race', 5],
  ['qual', 30],
]) {
  const settings = { ...STATE_SPACE_DEFAULTS, ...STATE_SPACE[session] };
  assert.equal(settings.sdJ, 0, `${session}: no move-specific driver variance`);
  assert.equal(settings.shrinkM, 1, `${session}: no move-specific driver shrinkage`);
  assert.equal(settings.mMover, 1, `${session}: no move-specific likelihood multiplier`);
  const stayer = runSession([first, follow(false)], session, 8);
  const mover = runSession([first, follow(true)], session, 8);
  const unchanged = stayer.ratings[1].drivers.get('a');
  const transferred = mover.ratings[1].drivers.get('a');
  assert.equal(transferred.m, unchanged.m, `${session}: no-evidence move keeps the portable mean`);
  assert.equal(transferred.sd, unchanged.sd, `${session}: no-evidence move keeps driver uncertainty`);
  assert.equal(mover.pre[1].rated.get('a'), stayer.pre[1].rated.get('a'));
  const standard = [first, follow(false)].map((weekend) => ({
    year: weekend.year,
    rows: weekend.rows,
    obs: session === 'race' ? weekend.raceObs : weekend.qualObs,
  }));
  const switched = [first, follow(true)].map((weekend) => ({
    year: weekend.year,
    rows: weekend.rows,
    obs: session === 'race' ? weekend.raceObs : weekend.qualObs,
  }));
  const old = { ...STATE_SPACE[session], sdJ: oldJump };
  const context = { canon: (id) => id, carOf: (id) => id, tmBoost: 8 };
  const legacyStayer = runStateSpace(standard, old, context).ratings[1].drivers.get('a');
  const legacyMover = runStateSpace(switched, old, context).ratings[1].drivers.get('a');
  assert(legacyMover.sd > legacyStayer.sd, `${session}: negative control detects the former move variance`);
}

// A separate driver/car fit can reset when equipment changes; it is not the
// portable driver mean and does not add move-specific driver learning.
const second = { year: 2024, rows: [{ ...a, constructorId: 'Y' }, b], raceObs: [{ ...pair, cx: 'Y', same: false }], qualObs: [] };
const third = (moved) => ({ year: 2024, rows: [{ ...a, constructorId: moved ? 'Z' : 'Y' }, b], raceObs: [], qualObs: [] });
const keptFit = runSession([first, second, third(false)], 'race', 8);
const resetFit = runSession([first, second, third(true)], 'race', 8);
assert.equal(keptFit.pre[2].rated.get('a'), resetFit.pre[2].rated.get('a'));
assert.notEqual(
  keptFit.pre[2].drivers.get('a'),
  resetFit.pre[2].drivers.get('a'),
  'driver-car fit can reset without changing portable ability',
);
console.log('PASS identical transfer learning rules and separate car-fit reset');
