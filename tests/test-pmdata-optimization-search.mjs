import assert from 'node:assert/strict';
import { adjustedProbabilities, hillClimb, scoreForecasts } from '../research/prediction-markets/pmdata/optimization/search.mjs';

const roster = [
  { name: 'A', baselineProbability: 0.6, formShift: 0.3, teammateFormShift: 0.2, fullHeadStrength: 1 },
  { name: 'B', baselineProbability: 0.4, formShift: -0.2, teammateFormShift: -0.2, fullHeadStrength: 0 },
];
const base = adjustedProbabilities(roster, { formWeight: 0, teammateWeight: 0, headWeight: 0 });
assert.ok(Math.abs(base.get('A') - 0.6) < 1e-12);
assert.ok(adjustedProbabilities(roster, { formWeight: 1, teammateWeight: 0, headWeight: 0 }).get('A') > base.get('A'));
assert.ok(adjustedProbabilities(roster, { formWeight: 0, teammateWeight: 1, headWeight: 0 }).get('A') > base.get('A'));
assert.throws(() => adjustedProbabilities([...roster, roster[0]], { formWeight: 0, teammateWeight: 0, headWeight: 0 }), /Duplicate/);
assert.throws(
  () => adjustedProbabilities([{ ...roster[0], formShift: NaN }], { formWeight: 0, teammateWeight: 0, headWeight: 0 }),
  /Invalid/,
);

const calls = [];
const results = hillClimb(
  (x) => {
    calls.push(x);
    return { tradedRaces: x.x === 0 ? 1 : 2, sharpePerRace: x.x + x.y };
  },
  { x: [0, 1, 2], y: [0, 1] },
  [{ x: 0, y: 0 }],
);
assert.deepEqual(results.selected.parameters, { x: 2, y: 1 });
assert.equal(results.selected.objective, 3);
assert.equal(calls.length, new Set(calls.map(JSON.stringify)).size, 'each candidate is evaluated once');
const infeasible = hillClimb(() => ({ tradedRaces: 1, sharpePerRace: 100 }), { x: [0, 1] }, [{ x: 0 }]);
assert.equal(infeasible.selected, null);
const alternatives = (x) => ({
  tradedRaces: 2,
  sharpePerRace: x.x === 0 ? 3 : 1,
  sortinoPerRace: x.x === 0 ? -1 : 4,
  profitFactor: x.x === 0 ? null : 2,
  returnToSettledDrawdown: x.x === 0 ? null : 5,
});
assert.equal(hillClimb(alternatives, { x: [0, 1] }, [{ x: 0 }]).selected.parameters.x, 0);
for (const metric of ['sortinoPerRace', 'profitFactor', 'returnToSettledDrawdown']) {
  const result = hillClimb(alternatives, { x: [0, 1] }, [{ x: 0 }], 4, metric);
  assert.equal(result.selected.parameters.x, 1, `${metric} must optimize its own objective`);
}
assert.throws(() => hillClimb(alternatives, { x: [0, 1] }, [{ x: 0 }], 4, 'unknown'), /Unsupported/);
const scores = scoreForecasts(
  [
    { race: 'race', split: 'training', features: { roster }, input: { resolution: { driver: 'A' } } },
    { race: 'race2', split: 'pseudo-holdout', features: { roster }, input: { resolution: { driver: 'Absent' } } },
  ],
  { formWeight: 0, teammateWeight: 0, headWeight: 0 },
);
assert.ok(Math.abs(scores.races[0].multiclassBrier - 0.32) < 1e-12);
assert.ok(Math.abs(scores.races[0].logLoss + Math.log(0.6)) < 1e-12);
assert.ok(Math.abs(scores.races[1].multiclassBrier - 1.52) < 1e-12);
assert.equal(scores.races[1].logLoss, null);
console.log('PASS chronological optimization search primitives');
