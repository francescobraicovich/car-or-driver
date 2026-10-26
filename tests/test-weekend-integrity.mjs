import assert from 'node:assert/strict';
import { loadData } from '../packages/research/node/common.mjs';
import { prepareWeekends } from '../packages/core/src/weekends.js';

const { raw } = await loadData();
const weekends = prepareWeekends(raw).weekends;
for (const weekend of weekends) {
  const raced = new Map(weekend.rows.map((row) => [row.driverId, row.constructorId]));
  for (const row of weekend.qrows) {
    const car = raced.get(row.driverId);
    if (car) assert.equal(row.constructorId, car, `qualifying and race team agree at ${weekend.rid}/${row.driverId}`);
  }
}
const spa2015 = weekends.find((weekend) => weekend.rid === '937');
assert.equal(spa2015.qrows.find((row) => row.driverId === '829').constructorId, '209', 'Manor uses its race constructor id');
const barcelona2025 = weekends.find((weekend) => weekend.rid === '1153');
assert.ok(
  barcelona2025.qrows.some((row) => row.driverId === '840'),
  'a qualifying-only entrant is preserved',
);
assert.ok(!barcelona2025.rows.some((row) => row.driverId === '840'), 'a qualifying-only entrant is not fabricated as a race starter');
console.log('PASS qualifying and race team identities agree; qualifying-only entrants remain');
