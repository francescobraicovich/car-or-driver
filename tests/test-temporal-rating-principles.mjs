import assert from 'node:assert/strict';
import { teammateGraphExam } from '../packages/core/src/teammate-graph-exam.js';
import { temperedHybridCandidate } from '../research/simplification/candidates-ranking.mjs';
import { mixGraph } from '../research/stable-ratings/tempered-candidates.mjs';
import { createTemporalTeammateGraph } from '../research/temporal-graph/temporal-teammate-graph.mjs';

function candidate(env) {
  const selected = teammateGraphExam(env.prep.weekends, { halfLifeYears: 3 });
  const graph = createTemporalTeammateGraph({ halfLifeYears: 3, annualDriftPoints: 4 });
  const snapshots = env.prep.weekends.map((weekend, i) =>
    graph.advance(
      weekend.info.date,
      weekend.rows.map((row) => row.driverId),
      selected[i].observations,
    ),
  );
  const base = temperedHybridCandidate(env, 0.25, false);
  return { race: mixGraph(env.timeline, base.race, snapshots, 0.05), qual: mixGraph(env.timeline, base.qual, snapshots, 0.05), snapshots };
}

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
function environment(previous, qualifyingOutcome, session, finalOutcome, allQualifying, crossSeason = false) {
  const timeline = [],
    weekends = [];
  for (let i = 0; i <= previous; i++) {
    const race = i < previous ? 1 : session === 'race' ? finalOutcome : null;
    const qual =
      i < previous && (allQualifying || i === 0) ? qualifyingOutcome : i === previous && session === 'qual' ? finalOutcome : null;
    const raceObs = race === null ? [] : [observation(race, 'race')];
    const qualObs = qual === null ? [] : [observation(qual, 'qual')];
    const date = crossSeason && i === previous ? '2025-01-01' : `2024-01-${String(i + 1).padStart(2, '0')}`;
    const year = Number(date.slice(0, 4));
    const info = { raceId: String(i + 1), year, round: i + 1, date };
    timeline.push({ i, year, raceId: info.raceId, rows, obs: { race: raceObs, qual: qualObs } });
    weekends.push({
      info,
      year,
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
      for (const session of ['race', 'qual'])
        for (const crossSeason of [false, true]) {
          const runs = [0, 1, null].map((result) => {
            const env = environment(previous, qualifyingOutcome, session, result, allQualifying, crossSeason);
            return candidate(env);
          });
          for (const component of ['race', 'qual']) {
            const before = gap(runs[0], component, previous, true);
            const preceding = gap(runs[0], component, previous - 1, false);
            const loser = gap(runs[0], component, previous, false);
            const winner = gap(runs[1], component, previous, false);
            const empty = gap(runs[2], component, previous, false);
            assert(
              loser <= before + 1e-8 && loser <= empty + 1e-8 && (crossSeason || loser <= preceding + 1e-8),
              `${session} ${component} crossSeason=${crossSeason} previous=${previous} qualifying=${qualifyingOutcome} allQualifying=${allQualifying}: defeat ${loser} pre ${before} prior ${preceding} empty ${empty}`,
            );
            assert(
              winner >= before - 1e-8 && winner >= empty - 1e-8 && (crossSeason || winner >= preceding - 1e-8),
              `${session} ${component} crossSeason=${crossSeason} previous=${previous} qualifying=${qualifyingOutcome} allQualifying=${allQualifying}: win ${winner} pre ${before} prior ${preceding} empty ${empty}`,
            );
            if (component === session && before > 0) assert(before - loser > winner - before, `${session}: upset influence`);
            assert.deepEqual(runs[0][component].pre[previous], runs[1][component].pre[previous], 'current outcome cannot change the prior');
          }
        }

// Winter drift is an observable prior transition: a win may raise the new
// prior while its post remains below the previous season's published value.
const winter = candidate(environment(20, 1, 'race', 1, true, true));
const winterEmpty = candidate(environment(20, 1, 'race', null, true, true));
assert(gap(winterEmpty, 'race', 20, false) < gap(winter, 'race', 19, false), 'season transition reduces the no-evidence control');
assert(Math.abs(gap(winterEmpty, 'race', 20, false) - gap(winter, 'race', 20, true)) < 1e-8);
assert(gap(winter, 'race', 20, false) > gap(winterEmpty, 'race', 20, false), 'the win raises the gap relative to same-date no evidence');
assert(gap(winter, 'race', 20, false) < gap(winter, 'race', 19, false));

const control = environment(5, 1, 'race', null, true, true);
const moved = environment(5, 1, 'race', null, true, true);
moved.timeline[5].rows = [{ ...a, constructorId: 'Y' }, b];
moved.prep.weekends[5].rows = moved.timeline[5].rows;
const controlRun = candidate(control),
  moveRun = candidate(moved);
for (const session of ['race', 'qual']) {
  assert(
    Math.abs(gap(controlRun, session, 5, false) - gap(moveRun, session, 5, false)) < 1e-8,
    `${session}: no-evidence move must match same-date control`,
  );
}
const prefix = { timeline: control.timeline.slice(0, 5), prep: { ...control.prep, weekends: control.prep.weekends.slice(0, 5) } };
assert.deepEqual(controlRun.snapshots[4], candidate(prefix).snapshots[4], 'graph results are prefix invariant');
console.log('PASS temporal rating principles: direction, surprise, chronology and no-evidence move');
