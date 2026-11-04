import assert from 'node:assert/strict';
import { runStateSpace } from '../packages/core/src/state-space/filter.js';
import { qualLink } from '../packages/core/src/state-space/qualifying-link.js';
import { hybridRatings } from '../packages/core/src/hybrid/ratings.js';
import { runSession, carLineage } from '../packages/core/src/state-space/build.js';
import { HYBRID } from '../packages/core/src/presets/hybrid.js';
import { STATE_SPACE } from '../packages/core/src/presets/state-space.js';

const context = { canon: (id) => id, tmBoost: 1 };
const rows = [
  { driverId: 'a', constructorId: 'X' },
  { driverId: 'b', constructorId: 'X' },
];
const pair = (outcome, src = 'finish') => ({
  x: 'a',
  y: 'b',
  cx: 'X',
  cy: 'X',
  o: outcome,
  w: 1,
  same: true,
  src,
});
const weekend = (obs) => ({ year: 2024, rows, obs });
const ratingDifference = (run) => run.ratings[0].drivers.get('a').m - run.ratings[0].drivers.get('b').m;

// A controlled teammate result informs driver comparison, and reversing it reverses the contribution.
{
  const aWins = runStateSpace([weekend([pair(1)])], {}, context);
  const bWins = runStateSpace([weekend([pair(0)])], {}, context);
  assert.ok(ratingDifference(aWins) > 0, 'the teammate winner gains relative driver rating');
  assert.ok(ratingDifference(bWins) < 0, 'reversing the result reverses the driver contribution');
  assert.equal(aWins.ratings[0].cars.get('X').m, 0, 'a same-car teammate result does not distinguish the car');
}

// With equal state uncertainty, the same winner's upset result moves the latent rating farther.
{
  const runWithKnownExpectation = (expectedGap) =>
    ratingDifference(
      runStateSpace(
        [weekend([pair(1)])],
        {},
        {
          ...context,
          offsets: [new Map([['a', expectedGap]])],
          offsetsPost: [new Map([['a', expectedGap]])],
        },
      ),
    ) - expectedGap;
  const expected = runWithKnownExpectation(40);
  const upset = runWithKnownExpectation(-40);
  assert.ok(upset > expected, 'an unexpected win is stronger evidence at fixed uncertainty');
}

// Repeated evidence strengthens the connection and reduces uncertainty more than a single result.
{
  const one = runStateSpace([weekend([pair(1)])], {}, context);
  const sustained = runStateSpace(
    Array.from({ length: 8 }, () => weekend([pair(1)])),
    {},
    context,
  );
  const sustainedDifference = sustained.ratings.at(-1).drivers.get('a').m - sustained.ratings.at(-1).drivers.get('b').m;
  assert.ok(sustainedDifference > ratingDifference(one), 'sustained evidence moves the driver comparison farther');
  assert.ok(
    sustained.ratings.at(-1).drivers.get('a').sd < one.ratings[0].drivers.get('a').sd,
    'sustained evidence reduces driver uncertainty',
  );
  assert.ok(one.ratings[0].drivers.get('a').sd > 0, 'one result leaves meaningful uncertainty');
}

// Team-wide evidence supports a car difference, while teammate comparisons remain driver evidence.
{
  const teamRows = [
    { driverId: 'a', constructorId: 'X' },
    { driverId: 'b', constructorId: 'X' },
    { driverId: 'c', constructorId: 'Y' },
    { driverId: 'd', constructorId: 'Y' },
  ];
  const observations = [];
  for (const x of teamRows.slice(0, 2))
    for (const y of teamRows.slice(2))
      observations.push({ x: x.driverId, y: y.driverId, cx: x.constructorId, cy: y.constructorId, o: 1, w: 1, same: false, src: 'finish' });
  const run = runStateSpace([{ year: 2024, rows: teamRows, obs: observations }], {}, context);
  assert.ok(run.ratings[0].cars.get('X').m > run.ratings[0].cars.get('Y').m, 'consistent cross-team results support the shared car');

  const teammateA = runStateSpace([weekend([pair(1)])], {}, context);
  const teammateB = runStateSpace([weekend([pair(0)])], {}, context);
  assert.notEqual(
    ratingDifference(teammateA),
    ratingDifference(teammateB),
    'teammate evidence changes the driver comparison independently',
  );
}

// A driver carries a portable mean across a team change without new performance evidence.
{
  const first = { year: 2024, rows, obs: [pair(1)] };
  const moved = {
    year: 2024,
    rows: [
      { driverId: 'a', constructorId: 'Y' },
      { driverId: 'b', constructorId: 'X' },
    ],
    obs: [],
  };
  const run = runStateSpace([first, moved], {}, context);
  assert.equal(run.ratings[1].drivers.get('a').m, run.ratings[0].drivers.get('a').m, 'no-evidence move preserves the portable driver mean');
  assert.equal(run.ratings[1].cars.get('Y').seen, false, 'the new car has no observed pace evidence');
}

// Rows alone (including a mechanical retirement with no valid pace comparison) do not imply poor pace.
{
  const run = runStateSpace([weekend([])], {}, context);
  assert.equal(run.ratings[0].drivers.get('a').m, 0);
  assert.equal(run.ratings[0].drivers.get('b').m, 0);
  assert.equal(run.ratings[0].drivers.get('a').seen, false, 'no performance observation means no pace evidence');
}

// Names and input order are labels, not evidence; future weekends cannot alter the first result.
{
  const first = weekend([pair(1), { ...pair(0), x: 'b', y: 'a', cx: 'X', cy: 'X' }]);
  const later = weekend([pair(0)]);
  const prefix = runStateSpace([first], {}, context);
  const extended = runStateSpace([first, later], {}, context);
  const reordered = runStateSpace([{ ...first, rows: [...rows].reverse(), obs: [...first.obs].reverse() }], {}, context);
  const renamedRows = rows.map(({ driverId, constructorId }) => ({
    driverId: driverId === 'a' ? 'renamed-a' : 'renamed-b',
    constructorId: constructorId === 'X' ? 'renamed-X' : constructorId,
  }));
  const renamed = runStateSpace(
    [
      {
        year: 2024,
        rows: renamedRows,
        obs: first.obs.map((ob) => ({
          ...ob,
          x: ob.x === 'a' ? 'renamed-a' : 'renamed-b',
          y: ob.y === 'a' ? 'renamed-a' : 'renamed-b',
          cx: 'renamed-X',
          cy: 'renamed-X',
        })),
      },
    ],
    {},
    context,
  );
  assert.equal(
    extended.ratings[0].drivers.get('a').m,
    prefix.ratings[0].drivers.get('a').m,
    'later evidence cannot change an earlier rating',
  );
  assert.equal(
    reordered.ratings[0].drivers.get('a').m,
    prefix.ratings[0].drivers.get('a').m,
    'row and pair order do not change the result',
  );
  assert.equal(
    renamed.ratings[0].drivers.get('renamed-a').m,
    prefix.ratings[0].drivers.get('a').m,
    'renaming entities preserves equivalent ratings',
  );
}

// Valid pre-retirement pace updates pace; finish ordering is not required for this evidence.
{
  const run = runStateSpace([weekend([pair(1, 'pace')])], {}, context);
  assert.ok(ratingDifference(run) > 0, 'a valid pace pair remains evidence even if a driver later retires');
}

// Qualifying changes reach the race forecast only through the explicit session link.
{
  const qWeeks = [weekend([pair(1, 'qual')]), weekend([pair(1, 'qual')])];
  const qReverse = [weekend([pair(0, 'qual')]), weekend([pair(0, 'qual')])];
  const qual = runStateSpace(qWeeks, {}, context);
  const qualReverse = runStateSpace(qReverse, {}, context);
  const raceWeeks = [weekend([pair(0)]), weekend([pair(0)])];
  const unlinked = runStateSpace(raceWeeks, {}, context);
  const linked = runStateSpace(raceWeeks, {}, { ...context, ...qualLink(qual, 1) });
  const linkedReverse = runStateSpace(raceWeeks, {}, { ...context, ...qualLink(qualReverse, 1) });
  assert.equal(
    unlinked.predictions[1].mean[0],
    runStateSpace(raceWeeks, {}, context).predictions[1].mean[0],
    'race-only evidence is reproducible without a qualifying link',
  );
  assert.ok(
    linked.predictions[1].mean[0] > linkedReverse.predictions[1].mean[0],
    'qualifying evidence has a traceable effect on a later race forecast',
  );
  assert.ok(ratingDifference(qual) > ratingDifference(qualReverse), 'changing qualifying evidence changes the qualifying rating');
}

// Production session runners keep evidence separate; the underlying filter/online estimate uses the fixed source blend.
{
  const productionRun = (raceOutcome, qualifyingOutcome) => {
    const wk = { year: 2024, rows, raceObs: [pair(raceOutcome)], qualObs: [pair(qualifyingOutcome, 'qual')] };
    const qualifying = runSession([wk], 'qual', 1);
    const race = runSession([wk], 'race', 1, qualifying);
    return { wk, race, qualifying, hybrid: hybridRatings([wk], race, qualifying, carLineage) };
  };
  const gap = (values) => (values.get('a').m ?? values.get('a')) - (values.get('b').m ?? values.get('b'));
  const postedGap = (result) => result.hybrid.ratings[0].drivers.get('a').m - result.hybrid.ratings[0].drivers.get('b').m;
  const raceShare = (1 - HYBRID.qualifyingDriverShare) * (1 - HYBRID.rankingDriverShare);
  const qualifyingShare = HYBRID.qualifyingDriverShare * (1 - HYBRID.rankingDriverShare);
  const explain = (result) =>
    raceShare * gap(result.race.ratings[0].drivers) +
    qualifyingShare * gap(result.qualifying.ratings[0].drivers) +
    HYBRID.rankingDriverShare * gap(result.hybrid.ranking.post[0].drivers);

  const qWin = productionRun(1, 1);
  const qLoss = productionRun(1, 0);
  assert.deepEqual(qWin.wk.raceObs, qLoss.wk.raceObs, 'a qualifying intervention leaves race observations intact');
  assert.ok(
    gap(qWin.qualifying.ratings[0].drivers) > gap(qLoss.qualifying.ratings[0].drivers),
    'qualifying output follows qualifying evidence',
  );
  for (const result of [qWin, qLoss])
    assert.ok(Math.abs(postedGap(result) - explain(result)) < 1e-9, 'underlying estimate is the fixed race/qualifying/online blend');
  assert.ok(
    Math.abs(gap(qWin.hybrid.ranking.post[0].drivers) - gap(qLoss.hybrid.ranking.post[0].drivers)) < 1e-12,
    'online ranking is unchanged when race evidence is fixed',
  );
  if (STATE_SPACE.link.beta === 0)
    assert.deepEqual(qWin.race.ratings, qLoss.race.ratings, 'with no driver link, qualifying cannot alter the raw race filter');

  const raceWin = productionRun(1, 1);
  const raceLoss = productionRun(0, 1);
  assert.deepEqual(raceWin.qualifying.ratings, raceLoss.qualifying.ratings, 'a race-only intervention leaves qualifying output unchanged');
  assert.deepEqual(raceWin.wk.qualObs, raceLoss.wk.qualObs, 'a race-only intervention leaves qualifying observations intact');
  for (const result of [raceWin, raceLoss])
    assert.ok(Math.abs(postedGap(result) - explain(result)) < 1e-9, 'race-only intervention still follows the same blend');
  assert.ok(
    Math.abs(
      postedGap(raceWin) -
        postedGap(raceLoss) -
        (raceShare * (gap(raceWin.race.ratings[0].drivers) - gap(raceLoss.race.ratings[0].drivers)) +
          HYBRID.rankingDriverShare * (gap(raceWin.hybrid.ranking.post[0].drivers) - gap(raceLoss.hybrid.ranking.post[0].drivers))),
    ) < 1e-9,
    'race-only published change comes from race and online evidence, not qualifying',
  );
}

// The production race filter reads qualifying driver levels, never qualifying car levels.
{
  const teamRows = [
    { driverId: 'a', constructorId: 'X' },
    { driverId: 'b', constructorId: 'X' },
    { driverId: 'c', constructorId: 'Y' },
    { driverId: 'd', constructorId: 'Y' },
  ];
  const observation = (x, y, cx, cy, o, same = false) => ({ x, y, cx, cy, o, w: 1, same, src: same ? 'teammate' : 'finish' });
  const weekends = Array.from({ length: 2 }, (_, i) => ({
    year: 2024,
    rows: teamRows,
    qualObs: [observation('a', 'b', 'X', 'X', 1, true), observation('c', 'd', 'Y', 'Y', 0, true), observation('a', 'c', 'X', 'Y', 1)],
    raceObs: [
      observation('a', 'b', 'X', 'X', 1, true),
      observation('c', 'd', 'Y', 'Y', 0, true),
      observation('a', 'c', 'X', 'Y', i === 0 ? 1 : 0),
    ],
  }));
  const qualifying = runSession(weekends, 'qual', 1);
  const carPerturbed = {
    ...qualifying,
    ratings: qualifying.ratings.map((rating) => ({
      ...rating,
      cars: new Map([...rating.cars].map(([id, value]) => [id, { ...value, m: value.m + (id === 'X' ? 25 : -25) }])),
    })),
  };
  assert.deepEqual(
    carPerturbed.ratings.map((rating) => rating.drivers),
    qualifying.ratings.map((rating) => rating.drivers),
    'qualifying driver levels are held fixed',
  );
  assert.notDeepEqual(
    carPerturbed.ratings.map((rating) => rating.cars),
    qualifying.ratings.map((rating) => rating.cars),
    'qualifying car levels are changed',
  );
  const ordinaryRace = runSession(weekends, 'race', 1, qualifying);
  const carPerturbedRace = runSession(weekends, 'race', 1, carPerturbed);
  assert.deepEqual(carPerturbedRace.ratings, ordinaryRace.ratings, 'qualifying car state does not alter production race ratings');
  assert.deepEqual(
    carPerturbedRace.predictions.map((prediction) => Array.from(prediction.mean)),
    ordinaryRace.predictions.map((prediction) => Array.from(prediction.mean)),
    'qualifying car state does not alter production race predictions',
  );
}

// The published hybrid path preserves the direction of a clean teammate result.
{
  const makeHybrid = (outcome) => {
    const wk = { ...weekend([pair(outcome)]), raceObs: [pair(outcome)], qualObs: [] };
    const race = runStateSpace([wk], {}, context);
    const qualifying = runStateSpace([weekend([])], {}, context);
    return hybridRatings([wk], race, qualifying, (id) => id);
  };
  const aWins = makeHybrid(1);
  const bWins = makeHybrid(0);
  assert.ok(aWins.ratings[0].drivers.get('a').m > aWins.ratings[0].drivers.get('b').m, 'hybrid rating reflects the winning teammate');
  assert.ok(bWins.ratings[0].drivers.get('a').m < bWins.ratings[0].drivers.get('b').m, 'hybrid rating reverses with the result');
}

console.log('PASS rating principles: controlled attribution, upset response, portable driver mean, session link, hybrid direction');
