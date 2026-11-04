import assert from 'node:assert/strict';
import { buildTemperedCandidates } from '../research/stable-ratings/tempered-candidates.mjs';
import { rankingCandidates, temperedHybridCandidate } from '../research/simplification/candidates-ranking.mjs';

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
        const runs = [0, 1, null].map((result) =>
          buildTemperedCandidates(environment(previous, qualifyingOutcome, session, result, allQualifying)),
        );
        for (const name of Object.keys(runs[0]).filter((name) => name !== 'baseline'))
          for (const component of ['race', 'qual']) {
            const before = gap(runs[0][name], component, previous, true);
            const loser = gap(runs[0][name], component, previous, false);
            const winner = gap(runs[1][name], component, previous, false);
            const empty = gap(runs[2][name], component, previous, false);
            assert(loser <= before + 1e-8 && loser <= empty + 1e-8, `${name} ${component}: a teammate defeat must not improve the gap`);
            const previousPost = gap(runs[0][name], component, previous - 1, false);
            assert(
              loser <= previousPost + 1e-8 && winner >= previousPost - 1e-8,
              `${name} ${component}: winner direction must hold against the preceding posted score`,
            );
            assert(winner >= before - 1e-8 && winner >= empty - 1e-8, `${name} ${component}: a teammate win must not worsen the gap`);
            if (component === session && gap(runs[0][name], session, previous, true) > 0)
              assert(
                before - loser > winner - before,
                `${name} ${component} ${session} previous=${previous} qualifying=${qualifyingOutcome} all=${allQualifying}: pre=${before}, defeat=${loser}, win=${winner}, empty=${empty}`,
              );
            assert.deepEqual(
              runs[0][name][component].pre[previous],
              runs[1][name][component].pre[previous],
              'current result cannot change its prior',
            );
          }
      }
const env = environment(5, 1, 'qual', 0, true);
const original = rankingCandidates['without-qualifying-car-link'](env);
const unchanged = temperedHybridCandidate(env, 1);
for (const session of ['race', 'qual']) {
  assert.deepEqual(unchanged[session].pre, original[session].pre);
  assert.deepEqual(unchanged[session].post, original[session].post);
  assert.deepEqual(unchanged[session].z, original[session].z);
}
const relabeled = environment(5, 1, 'qual', 0, true);
const replace = (_key, value) => (value === 'a' ? 'b' : value === 'b' ? 'a' : value);
relabeled.timeline = JSON.parse(JSON.stringify(relabeled.timeline, replace));
relabeled.prep.weekends = JSON.parse(JSON.stringify(relabeled.prep.weekends, replace));
const standardRuns = buildTemperedCandidates(env);
const relabeledRuns = buildTemperedCandidates(relabeled);
for (const name of Object.keys(standardRuns))
  for (const session of ['race', 'qual']) {
    const run = standardRuns[name][session];
    assert(
      Math.abs(gap(standardRuns[name], session, 5, false) + gap(relabeledRuns[name], session, 5, false)) < 1e-8,
      `${name} ${session}: driver labels cannot change relative rating`,
    );
    assert.equal(run.raw.pre, run.pre);
    assert.equal(run.raw.ratings, run.post);
    run.z[5].plain.forEach((value, index) => assert(Math.abs(run.raw.predictions[5].mean[index] * run.k - value) < 1e-10));
  }
console.log('PASS tempered candidates: controlled direction, empty controls, mixed evidence and chronology');
