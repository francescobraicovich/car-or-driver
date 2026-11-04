import assert from 'node:assert/strict';
import { loadData } from '../packages/research/node/common.mjs';
import { buildWeekendSignals } from '../research/prediction-markets/weekend/signals.mjs';

const context = await loadData();
const target = context.raw.races.find((race) => String(race.raceId) === '1176');
assert.ok(target);
const original = buildWeekendSignals(context, target);
const changedFinish = {
  ...context,
  raw: {
    ...context.raw,
    results: context.raw.results.map((row) =>
      String(row.raceId) === '1176' ? { ...row, positionOrder: String(100 + Number(row.positionOrder)), grid: '99' } : row,
    ),
  },
};
const afterFinishChange = buildWeekendSignals(changedFinish, target);
assert.deepEqual(afterFinishChange.preQualifying.roster, original.preQualifying.roster);
assert.deepEqual(afterFinishChange.postQualifying.roster, original.postQualifying.roster);
const changedQualifying = {
  ...context,
  raw: {
    ...context.raw,
    qualifying: context.raw.qualifying.map((row) =>
      String(row.raceId) === '1176' ? { ...row, position: String(23 - Number(row.position)) } : row,
    ),
  },
};
const afterQualifyingChange = buildWeekendSignals(changedQualifying, target);
assert.deepEqual(afterQualifyingChange.preQualifying.roster, original.preQualifying.roster);
assert.notDeepEqual(afterQualifyingChange.postQualifying.roster, original.postQualifying.roster);
console.log('PASS target race results excluded and qualifying affects only the later signal');
