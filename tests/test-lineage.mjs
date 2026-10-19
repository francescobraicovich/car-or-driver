// Team continuity: a renamed team inherits its predecessor's car rating, a takeover does not unless asked,
// and the default parameters change nothing.
import assert from 'node:assert/strict';
import { loadData } from '../packages/research/node/common.mjs';
import { buildEloCore } from '../packages/core/src/elo-core.js';
import { TUNED_ELO } from '../packages/core/src/presets/tuned-elo.js';
import { CONSTRUCTOR_LINEAGE } from '../packages/core/src/lineage.js';

const ctx = await loadData('data');

/** Race and qualifying car ratings of the given constructors at the first weekend of `year` that `watch` races in. */
function ratingsAt(params, year, watch, ids) {
  let out = null;
  buildEloCore(
    ctx.raw,
    ctx.lapSnapshots,
    ctx.maps,
    { ...TUNED_ELO, ...params },
    ctx.lapPace,
    {
      beforeWeekend: ({ info, rows, C, QC }) => {
        if (out || info.year !== year || !rows.some((r) => r.constructorId === watch)) return;
        out = Object.fromEntries(ids.map((id) => [id, { race: C.get(id), qual: QC.get(id) }]));
      },
    },
    { lean: true },
  );
  return out;
}

// Force India (10) -> Racing Point (211), 2019: a rename. Both are shrunk by the same winter rule, so they must match.
{
  const off = ratingsAt({}, 2019, '211', ['10', '211']);
  const on = ratingsAt({ lineage: 1 }, 2019, '211', ['10', '211']);
  assert.equal(off['211'].race, 1000, 'without lineage the new id starts at the field average');
  assert.ok(Math.abs(off['10'].race - 1000) > 1, 'Force India had a real rating to inherit');
  assert.equal(on['211'].race, on['10'].race, 'Racing Point carries Force India’s race rating');
  assert.equal(on['211'].qual, on['10'].qual, 'and its qualifying rating');
}

// Honda (11) -> Brawn (23), 2009: a takeover. Bit 1 leaves it alone, bit 2 carries it.
{
  const none = ratingsAt({ lineage: 1 }, 2009, '23', ['11', '23']);
  const took = ratingsAt({ lineage: 2 }, 2009, '23', ['11', '23']);
  assert.equal(none['23'].race, 1000, 'a takeover is not inherited by default');
  assert.equal(took['23'].race, took['11'].race, 'with bit 2 it is');
}

// Every transition names real constructor ids from the data and a plausible year.
const known = new Set(ctx.raw.constructors.map((c) => String(c.constructorId)));
for (const t of CONSTRUCTOR_LINEAGE) {
  assert.ok(known.has(t.from) && known.has(t.to), `${t.from} -> ${t.to} are constructor ids`);
  assert.ok(t.year >= 2002 && t.year <= 2026);
}
console.log(`PASS lineage: ${CONSTRUCTOR_LINEAGE.length} transitions, renames inherit, takeovers only when asked, default unchanged`);
