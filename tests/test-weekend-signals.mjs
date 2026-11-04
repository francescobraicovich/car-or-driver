import assert from 'node:assert/strict';
import {
  sessionTimes,
  matchQualifying,
  headProbabilities,
  scoreWeekend,
  summarizeScores,
  compareForm,
} from '../research/prediction-markets/weekend/signals.mjs';

const race = { quali_date: '2026-06-06', quali_time: '14:00:00', date: '2026-06-07', time: '13:00:00' };
const times = sessionTimes(race);
assert.equal(new Date(times.preQualifyingDecision).toISOString(), '2026-06-06T00:00:00.000Z');
assert.equal(new Date(times.postQualifyingDecision).toISOString(), '2026-06-07T10:00:00.000Z');
assert.throws(() => sessionTimes({ ...race, quali_date: '2026-06-07', quali_time: '08:00:00' }), /publication buffer/);
assert.throws(() => sessionTimes({ ...race, time: '\\N' }), /Invalid|Timestamp/);

const roster = [
  { driverId: '1', constructorId: '11' },
  { driverId: '2', constructorId: '12' },
  { driverId: '3', constructorId: '13' },
];
const qualifying = [
  { driverId: '1', constructorId: '11', position: '2' },
  { driverId: '2', constructorId: '12', position: '1' },
  { driverId: '3', constructorId: '99', position: '3' },
];
const matched = matchQualifying(roster, qualifying);
assert.deepEqual(matched.excluded, ['3']);
assert.equal(matched.grid.get('1'), 2);
assert.throws(() => matchQualifying(roster, [...qualifying, qualifying[0]]), /duplicate/);
assert.throws(
  () =>
    matchQualifying(
      roster,
      qualifying.map((row) => ({ ...row, position: 1 })),
    ),
  /Duplicate/,
);
assert.throws(() => matchQualifying(roster, [qualifying[0]]), /Insufficient/);

const projected = [
  { driverId: '1', fullHeadStrength: 1, formShift: 0.5 },
  { driverId: '2', fullHeadStrength: 0, formShift: -0.5 },
];
const full = headProbabilities(projected, true),
  noForm = headProbabilities(projected, false);
assert.ok(full[0].probability > noForm[0].probability);
assert.ok(Math.abs(full.reduce((sum, row) => sum + row.probability, 0) - 1) < 1e-12);
assert.deepEqual(
  noForm.map((row) => row.probability),
  [0.5, 0.5],
);
assert.throws(() => headProbabilities(projected, 'yes'), /Invalid/);
const scores = scoreWeekend({ preQualifying: { roster: projected }, postQualifying: { roster: projected } }, '1');
assert.ok(scores.preQualifying.withForm.logLoss < scores.preQualifying.withoutForm.logLoss);
const absent = scoreWeekend({ preQualifying: { roster: projected }, postQualifying: { roster: projected } }, '3');
const summary = summarizeScores([{ scores }, { scores: absent }]);
assert.equal(summary.preQualifying.withForm.missingWinners, 1);
assert.equal(summary.preQualifying.withForm.meanLogLoss, null);
assert.ok(summary.preQualifying.withForm.meanBrier > 0);
const paired = compareForm([{ scores }, { scores: absent }]);
assert.equal(paired.preQualifying.finiteLogLossPairs, 1);
assert.equal(paired.preQualifying.logLossImproved, 1);
assert.ok(paired.preQualifying.meanLogLossDifferenceWithMinusWithout < 0);
console.log('PASS pre- and post-qualifying information cutoffs, roster matching and paired proper scores');
