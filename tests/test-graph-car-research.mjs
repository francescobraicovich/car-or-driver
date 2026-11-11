import assert from 'node:assert/strict';
import { graphCarRatings, midpointCarRatings } from '../research/graph-car-ratings/model.mjs';

const identity = { canon: (id) => id, carOf: (id) => id, tmBoost: 1 };
const rows = [
  { driverId: 'a', constructorId: 'A' },
  { driverId: 'b', constructorId: 'A' },
  { driverId: 'c', constructorId: 'B' },
  { driverId: 'd', constructorId: 'B' },
];
const cross = { x: 'a', y: 'c', cx: 'A', cy: 'B', o: 1, w: 1, same: false, src: 'finish' };
const teammate = { x: 'a', y: 'b', cx: 'A', cy: 'A', o: 1, w: 1, same: true, src: 'finish' };
const timeline = Array.from({ length: 3 }, (_, i) => ({
  i,
  year: 2020,
  rows,
  obs: { race: [cross], qual: [{ ...cross, src: 'qual' }] },
}));
const levels = (a = 0) =>
  new Map([
    ['a', a],
    ['b', 0],
    ['c', 0],
    ['d', 0],
  ]);
const graph = timeline.map(() => ({ pre: { levels: levels() }, post: { levels: levels() } }));
const original = graphCarRatings(timeline, identity, graph);
assert.ok(original.race.post[0].cars.get('A').m > original.race.post[0].cars.get('B').m);
assert.equal(original.race.pre[0].cars.get('A'), original.race.pre[0].cars.get('B'));
assert.equal(original.race.post[0].drivers.get('a').m, 0);
assert.equal(original.race.post[0].drivers.get('a').sd, null);
assert.equal(original.race.z[0].adj[0], original.race.z[0].plain[0]);

// The car update uses the frozen pre-weekend graph, not the same-weekend post graph.
const changedPost = graph.map((item, i) => (i === 0 ? { ...item, post: { levels: levels(100) } } : item));
const postChanged = graphCarRatings(timeline, identity, changedPost);
assert.equal(postChanged.race.post[0].cars.get('A').m, original.race.post[0].cars.get('A').m);
assert.notEqual(postChanged.race.post[0].drivers.get('a').m, original.race.post[0].drivers.get('a').m);

const future = timeline.map((weekend, i) =>
  i === 2
    ? {
        ...weekend,
        obs: {
          race: [{ ...cross, o: 0 }],
          qual: [{ ...cross, o: 0, src: 'qual' }],
        },
      }
    : weekend,
);
const changedFuture = graphCarRatings(future, identity, graph);
assert.deepEqual(changedFuture.race.post.slice(0, 2), original.race.post.slice(0, 2));
assert.deepEqual(changedFuture.race.pre.slice(0, 3), original.race.pre.slice(0, 3));
assert.deepEqual(changedFuture.race.z.slice(0, 3), original.race.z.slice(0, 3));

const sameTeam = timeline.map((weekend) => ({ ...weekend, obs: { race: [teammate], qual: [{ ...teammate, src: 'qual' }] } }));
const teamOnly = graphCarRatings(sameTeam, identity, graph);
assert.equal(teamOnly.race.post[0].cars.get('A').m, 0);
assert.equal(teamOnly.race.post[0].cars.get('B').m, 0);
assert.throws(() => graphCarRatings(timeline, identity, graph.slice(1)), /lengths differ/);
const invalid = graph.map((item, i) => (i === 0 ? { ...item, post: { levels: new Map() } } : item));
assert.throws(() => graphCarRatings(timeline, identity, invalid), /Missing graph level/);

const portable = new Map([
  ['a', 20],
  ['b', 0],
  ['c', -20],
  ['d', 0],
]);
const source = {
  pre: timeline.map(() => ({ rated: portable })),
  post: timeline.map(() => ({ drivers: new Map([...portable].map(([id, m]) => [id, { m }])) })),
};
const published = { race: source, qual: source };
const midpoint = midpointCarRatings(timeline, identity, graph, published);
assert.equal(midpoint.race.pre[0].rated.get('a'), 10);
assert.equal(midpoint.race.post[0].drivers.get('c').m, -10);
assert.ok(midpoint.race.z[0].plain[0] > original.race.z[0].plain[0]);
assert.ok(
  midpoint.race.post[0].cars.get('A').m < original.race.post[0].cars.get('A').m,
  'a stronger pre-weekend driver estimate leaves less of the result for the car to learn',
);
const revisedSource = {
  ...source,
  post: source.post.map((snapshot, i) =>
    i === 0
      ? {
          drivers: new Map([...portable].map(([id, m]) => [id, { m: m * 10 }])),
        }
      : snapshot,
  ),
};
const revisedMidpoint = midpointCarRatings(timeline, identity, graph, { race: revisedSource, qual: revisedSource });
assert.deepEqual(
  revisedMidpoint.race.post[0].cars,
  midpoint.race.post[0].cars,
  'same-weekend published driver revisions do not enter that weekend car update',
);
assert.notEqual(revisedMidpoint.race.post[0].drivers.get('a').m, midpoint.race.post[0].drivers.get('a').m);
assert.throws(
  () =>
    midpointCarRatings(timeline, identity, graph, {
      race: { ...source, pre: [] },
      qual: source,
    }),
  /Published and timeline lengths differ/,
);
console.log('Graph and car experiment tests passed');
