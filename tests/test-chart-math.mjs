import assert from 'node:assert/strict';
import { assignSlots, decimalsFor, nearestIndex, niceTicks, slotFor, spreadLabels, timeTicks } from '../site/js/chart-math.js';

// round ticks
{
  const t = niceTicks(944.3, 1073.2, 5);
  assert.ok(t.ticks.length >= 4 && t.ticks.length <= 8, 'a sensible number of ticks');
  for (const v of t.ticks) assert.equal(v % 25, 0, `tick ${v} is a round number`);
  assert.ok(t.lo <= 944.3 && t.hi >= 1073.2, 'ticks cover the data');
  const p = niceTicks(0, 100, 5);
  assert.deepEqual(p.ticks, [0, 20, 40, 60, 80, 100]);
  const flat = niceTicks(1000, 1000);
  assert.ok(flat.hi > flat.lo, 'flat data still gets a range');
  const small = niceTicks(0.31, 0.36, 5);
  assert.ok(
    small.ticks.every((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9),
    '0.01 steps, no float noise',
  );
  assert.equal(decimalsFor(0.01), 2);
  assert.equal(decimalsFor(25), 0);
}

// date ticks
{
  const y = (yr) => Date.UTC(yr, 0, 1);
  const long = timeTicks(Date.UTC(2000, 2, 12), Date.UTC(2026, 8, 13), 8);
  assert.ok(long.length >= 3 && long.length <= 8, 'few year ticks over 26 years');
  assert.ok(long.every((tk) => /^\d{4}$/.test(tk.label) && tk.t === y(+tk.label)));
  const short = timeTicks(Date.UTC(2026, 2, 8), Date.UTC(2026, 8, 13), 8);
  assert.ok(short.length >= 3 && short.every((tk) => tk.t >= Date.UTC(2026, 2, 8) && tk.t <= Date.UTC(2026, 8, 13)));
  assert.deepEqual(timeTicks(5, 5), []);
}

// label spreading
{
  const ys = spreadLabels(
    [
      { id: 'a', y: 100 },
      { id: 'b', y: 102 },
      { id: 'c', y: 104 },
      { id: 'd', y: 300 },
    ],
    14,
    0,
    400,
  );
  const v = ['a', 'b', 'c', 'd'].map((k) => ys.get(k));
  for (let i = 1; i < v.length; i++) assert.ok(v[i] - v[i - 1] >= 14 - 1e-9, 'labels keep their distance');
  assert.equal(ys.get('d'), 300, 'an isolated label stays where it is');
  const mean = (ys.get('a') + ys.get('b') + ys.get('c')) / 3;
  assert.ok(Math.abs(mean - 102) < 1e-9, 'a stack stays centred on its anchors');
  const edge = spreadLabels(
    [
      { id: 'x', y: -50 },
      { id: 'y', y: -49 },
    ],
    14,
    0,
    400,
  );
  assert.ok(edge.get('x') >= 0 && edge.get('y') - edge.get('x') >= 14, 'clamped inside the plot');
  const bottom = spreadLabels(
    [
      { id: 'x', y: 399 },
      { id: 'y', y: 400 },
    ],
    14,
    0,
    400,
  );
  assert.ok(bottom.get('y') <= 400 && bottom.get('y') - bottom.get('x') >= 14);
}

// colours stay put while the selection changes
{
  const held = new Map();
  assignSlots(held, ['a', 'b', 'c']);
  assert.deepEqual(
    [...held],
    [
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ],
  );
  assignSlots(held, ['a', 'c', 'd']); // b leaves, d arrives
  assert.equal(held.get('a'), 0, 'survivors keep their hue');
  assert.equal(held.get('c'), 2);
  assert.equal(held.get('d'), 1, 'a newcomer takes the freed slot');
  const many = assignSlots(
    new Map(),
    Array.from({ length: 10 }, (_, i) => `e${i}`),
  );
  assert.equal(new Set([...many.values()].slice(0, 8)).size, 8, 'first eight are all distinct');
  assert.ok([...many.values()].every((s) => s >= 0 && s < 8));
  assert.equal(slotFor('driver:1'), slotFor('driver:1'));
}

assert.equal(nearestIndex([1, 5, 9], 6), 1);
assert.equal(nearestIndex([1, 5, 9], 8), 2);
assert.equal(nearestIndex([], 3), -1);

console.log('PASS chart maths: round ticks, date ticks, label spacing, stable colours');
