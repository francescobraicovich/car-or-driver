import assert from 'node:assert/strict';
import { simulatedWeekends } from '../research/stable-ratings/synthetic-weekends.mjs';
import { teammateGraphExam } from '../packages/core/src/teammate-graph-exam.js';
const race = { x: '1', y: '2', cx: 'a', cy: 'a', o: 1, w: 2, same: true, src: 'finish', base: 1 };
const qual = { x: '1', y: '2', cx: 'a', cy: 'a', o: 0, w: 2, same: true, src: 'qual', seg: 'q2', tx: 80, ty: 79 };
const make = (realOutcome) => [
  {
    year: 2008,
    round: 1,
    date: '2008-01-01',
    raceId: '1',
    rows: [
      { driverId: '1', constructorId: 'a' },
      { driverId: '2', constructorId: 'a' },
    ],
    obs: { race: [race], qual: [qual] },
    replayObs: [{ ob: { obs: realOutcome } }],
  },
];
const a = simulatedWeekends(make(0)),
  b = simulatedWeekends(make(1));
assert.deepEqual(a, b);
assert.equal(a[0].raceObs[0], race);
assert.equal(a[0].qualObs[0], qual);
const graph = teammateGraphExam(a, { halfLifeYears: 3 });
assert.equal(graph[0].post.evidence[0].wins, 1.5);
assert.equal(graph[0].post.evidence[0].losses, 1);
assert.throws(() => simulatedWeekends([{ ...make(0)[0], obs: { race: [{ ...race, base: undefined }], qual: [qual] } }]), /metadata/);
assert.throws(() => simulatedWeekends([{ ...make(0)[0], obs: { race: [race], qual: [{ ...qual, o: 1 }] } }]), /metadata/);
console.log('Synthetic graph evidence tests passed');
