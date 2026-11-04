import assert from 'node:assert/strict';
import { runPublishedRatings, runSession, carLineage } from '../packages/core/src/state-space/build.js';
import { hybridRatings } from '../packages/core/src/hybrid/ratings.js';
import { teammateGraphExam } from '../packages/core/src/teammate-graph-exam.js';

const a = { driverId: 'a', constructorId: 'X' };
const b = { driverId: 'b', constructorId: 'X' };
const rows = [a, b];
const observation = (outcome, session) => ({
  x: 'a',
  y: 'b',
  cx: 'X',
  cy: 'X',
  o: outcome,
  w: 8,
  same: true,
  src: session === 'race' ? 'finish' : 'qual',
});
const replay = (outcome, session) => ({
  session,
  ob:
    session === 'race'
      ? { x: a, y: b, obs: outcome, source: 'finish', base: 12 }
      : { x: a, y: b, obs: outcome, seg: 'q1', tx: outcome ? 80 : 81, ty: outcome ? 81 : 80 },
});
function environment(previous, qualifyingOutcome, session, finalOutcome, allQualifying) {
  const timeline = [],
    weekends = [];
  for (let i = 0; i <= previous; i++) {
    const race = i < previous ? 1 : session === 'race' ? finalOutcome : null;
    const qual =
      i < previous && (allQualifying || i === 0) ? qualifyingOutcome : i === previous && session === 'qual' ? finalOutcome : null;
    const raceObs = race === null ? [] : [observation(race, 'race')];
    const qualObs = qual === null ? [] : [observation(qual, 'qual')];
    const info = { raceId: String(i + 1), year: 2024, round: i + 1, date: `2024-01-${String(i + 1).padStart(2, '0')}` };
    timeline.push({ i, year: 2024, raceId: info.raceId, rows, obs: { race: raceObs, qual: qualObs } });
    weekends.push({
      info,
      year: 2024,
      rows,
      raceObs,
      qualObs,
      replayObs: [...(race === null ? [] : [replay(race, 'race')]), ...(qual === null ? [] : [replay(qual, 'qual')])],
    });
  }
  return { timeline, prep: { weekends, ctx: { canon: (id) => id, carOf: (id) => id, tmBoost: 8 } } };
}
const gap = (run, session, i, pre) => {
  const values = pre ? run[session].pre[i].rated : run[session].post[i].drivers;
  return pre ? values.get('a') - values.get('b') : values.get('a').m - values.get('b').m;
};
for (const previous of [1, 5, 20])
  for (const qualifyingOutcome of [0, 1])
    for (const allQualifying of [false, true])
      for (const session of ['race', 'qual']) {
        const runs = [0, 1, null].map((result) => {
          const env = environment(previous, qualifyingOutcome, session, result, allQualifying);
          const raw = runPublishedRatings(env.prep.weekends, 8);
          return Object.fromEntries(Object.entries(raw).map(([name, run]) => [name, { ...run, post: run.ratings }]));
        });
        for (const component of ['race', 'qual']) {
          const before = gap(runs[0], component, previous, true);
          const preceding = gap(runs[0], component, previous - 1, false);
          const loser = gap(runs[0], component, previous, false);
          const winner = gap(runs[1], component, previous, false);
          const empty = gap(runs[2], component, previous, false);
          assert(loser <= before + 1e-8 && loser <= empty + 1e-8 && loser <= preceding + 1e-8, `${session} ${component}: defeat direction`);
          assert(winner >= before - 1e-8 && winner >= empty - 1e-8 && winner >= preceding - 1e-8, `${session} ${component}: win direction`);
          if (component === session && before > 0) assert(before - loser > winner - before, `${session}: upset influence`);
          assert.deepEqual(runs[0][component].pre[previous], runs[1][component].pre[previous], 'current outcome cannot change the prior');
        }
      }
// Session interventions have an exact, visible decomposition. Race evidence can
// reach published qualifying only through the explicitly shared graph term.
const interventions = [];
for (const [raceOutcome, qualifyingOutcome] of [
  [1, 1],
  [0, 1],
  [1, 0],
]) {
  const weekend = {
    info: { raceId: '1', date: '2024-01-01' },
    year: 2024,
    rows,
    raceObs: [observation(raceOutcome, 'race')],
    qualObs: [observation(qualifyingOutcome, 'qual')],
    replayObs: [replay(raceOutcome, 'race'), replay(qualifyingOutcome, 'qual')],
  };
  const qualifying = runSession([weekend], 'qual', 8);
  const race = runSession([weekend], 'race', 8, qualifying);
  const hybrid = hybridRatings([weekend], race, qualifying, carLineage);
  const graph = teammateGraphExam([weekend], { halfLifeYears: 3 })[0].post.levels;
  const published = runPublishedRatings([weekend], 8);
  for (const [session, underlying] of [
    ['race', hybrid],
    ['qual', qualifying],
  ]) {
    const baseGap = underlying.ratings[0].drivers.get('a').m - underlying.ratings[0].drivers.get('b').m;
    const actualGap = published[session].ratings[0].drivers.get('a').m - published[session].ratings[0].drivers.get('b').m;
    assert(Math.abs(actualGap - (0.95 * baseGap + 0.05 * (graph.get('a') - graph.get('b')))) < 1e-9);
  }
  interventions.push({ qualifying, hybrid, published });
}
assert.deepEqual(interventions[0].qualifying.ratings, interventions[1].qualifying.ratings, 'race-only change leaves raw qualifying intact');
assert.deepEqual(
  interventions[0].hybrid.ranking.post,
  interventions[2].hybrid.ranking.post,
  'qualifying-only change leaves online race evidence intact',
);
console.log('PASS native graph rating principles and session decomposition with mixed teammate evidence');
