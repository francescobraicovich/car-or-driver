// The rookie prior: debutants start where the parameters say, veterans of the first season are
// untouched, and the default parameters change nothing.
import assert from 'node:assert/strict';
import { loadData } from '../packages/research/node/common.mjs';
import { buildEloCore } from '../packages/core/src/elo-core.js';
import { TUNED_ELO } from '../packages/core/src/presets/tuned-elo.js';

const ctx = await loadData('data');

/** Each driver's rating the first time the model sees them, with the year it was seen. */
function startingRatings(params) {
  const first = new Map();
  let firstYear = null;
  buildEloCore(
    ctx.raw,
    ctx.lapSnapshots,
    ctx.maps,
    params,
    ctx.lapPace,
    {
      beforeWeekend: ({ info, rows, D }) => {
        firstYear ??= info.year;
        for (const r of rows)
          if (!first.has(r.driverId)) first.set(r.driverId, { rating: D.get(r.driverId), year: info.year, date: info.date });
      },
    },
    { lean: true },
  );
  return { first, firstYear };
}

const base = startingRatings(TUNED_ELO);
const zero = startingRatings({ ...TUNED_ELO, rookieStart: 0, rookieAge: 0, rookieTau: 0 });
for (const [id, s] of base.first) assert.equal(zero.first.get(id).rating, s.rating, 'zero rookie parameters change nothing');
for (const { rating } of base.first.values()) assert.equal(rating, 1000, 'every driver starts at 1000 without a rookie prior');

// A flat offset moves debutants only.
const shifted = startingRatings({ ...TUNED_ELO, rookieStart: -6 });
let rookies = 0;
for (const s of shifted.first.values()) {
  if (s.year === shifted.firstYear) assert.equal(s.rating, 1000, 'drivers already racing in the first season are not rookies');
  else {
    rookies++;
    assert.equal(s.rating, 994, 'a debutant starts at 1000 + rookieStart');
  }
}
assert.ok(rookies > 100, `${rookies} debutants found`);

// The age term: younger debutants start higher, by rookieAge points per year.
const dob = new Map(ctx.raw.drivers.map((d) => [String(d.driverId), Date.parse(d.dob)]));
const aged = startingRatings({ ...TUNED_ELO, rookieStart: -6, rookieAge: -4 });
for (const [id, s] of aged.first) {
  if (s.year === aged.firstYear) continue;
  const age = (Date.parse(s.date) - dob.get(String(id))) / (365.25 * 86400000);
  assert.ok(Math.abs(s.rating - (1000 - 6 - 4 * (age - 22))) < 1e-9, `driver ${id}: age ${age.toFixed(1)} start ${s.rating.toFixed(2)}`);
}
console.log(`PASS rookie prior: ${rookies} debutants start at the stated rating, first-season drivers untouched, defaults change nothing`);
