import assert from 'node:assert/strict';
import { matchedPace, measurementRows, outcomeRows } from '../research/unified-ratings/evidence.mjs';

const x = {
  driverId: 'a',
  constructorId: '1',
  q1: '1:20.000',
  q2: '1:19.000',
  q3: '1:21.000',
  laps: 50,
  positionOrder: 1,
  statusName: 'Finished',
};
const y = {
  driverId: 'b',
  constructorId: '1',
  q1: '1:20.100',
  q2: '1:19.100',
  q3: '1:20.000',
  laps: 49,
  positionOrder: 2,
  statusName: '+1 Lap',
};
const week = {
  info: { raceId: '1' },
  year: 2008,
  rows: [x, y],
  qrows: [x, y],
  rawRows: [x, y],
  replayObs: [],
  preQ: {
    inc: new Map([
      ['a', 0.001],
      ['b', 0.002],
    ]),
    rel: new Map([['1', 0.001]]),
  },
};
const original = measurementRows(week, new Map(), new Map());
const refined = measurementRows(week, new Map(), new Map(), { qualifyingFormat: true });
assert.ok(original[0].target < 0 && refined[0].target > 0, 'fuel-loaded Q3 must not override comparable Q2 in the refinement');
assert.equal(measurementRows({ ...week, qrows: [x, y, x] }, new Map(), new Map()).length, 1, 'duplicate records add no evidence');
assert.equal(
  measurementRows({ ...week, qrows: [x, { ...y, q3: x.q3 }] }, new Map(), new Map())[0].target,
  0,
  'timing ties remain zero margins',
);
const a = new Map([
  [2, 80],
  [3, 80],
  [4, 81],
  [5, 81],
]);
const b = new Map([
  [6, 80],
  [7, 80],
  [8, 81],
  [9, 81],
]);
assert.equal(matchedPace(a, b), null, 'same broad window without common laps is insufficient');
assert.equal(matchedPace(a, a).margin, 0);
const slower = new Map([...a].map(([lap, time]) => [lap, time + 1]));
assert.ok(matchedPace(a, slower).margin > 0);
assert.equal(matchedPace(a, new Map([...slower].slice(0, 3))), null);
const mechanical = { ...y, laps: 12, statusName: 'Engine' };
const failed = { ...week, rawRows: [x, mechanical] };
assert.equal(outcomeRows(failed).length, 1, 'actual-outcome exam includes retirements');
assert.equal(outcomeRows(failed)[0].bothFinish, false);
assert.equal(
  measurementRows(failed, new Map(), new Map()).filter((row) => row.channel === 2).length,
  0,
  'mechanical DNF alone is not strength evidence',
);
assert.equal(outcomeRows({ ...week, rawRows: [x, { ...y, statusName: 'Disqualified' }] }).length, 0);
assert.equal(
  outcomeRows({
    ...week,
    rawRows: [
      { ...x, laps: 1 },
      { ...y, laps: 1 },
    ],
  }).length,
  0,
);
console.log('PASS unified evidence: matching, format, duplicates, ties, retirement and outcome coverage');
