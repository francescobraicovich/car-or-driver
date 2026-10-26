// Simulator v2 (packages/eval/src/synthetic-v2.js): opt-in, deterministic, built on the real calendar, with observations made by the
// exam's own code from simulated results, lap times and snapshots, and a shipped filter that forecasts it about as well as it forecasts
// the real data (the loose bands below; the full comparison is in docs/evaluation.md and packages/research/node/simulation-check.mjs).
import assert from 'node:assert/strict';
import { loadData } from '../packages/research/node/common.mjs';
import {
  WORLD_V2_DEFAULTS,
  indexTimeline,
  observationRows,
  fitSlope,
  nll,
  stateSpaceRun,
  syntheticWorld,
  truncateTimeline,
  worldFromHyper,
  worldParamsV2,
} from '../packages/eval/src/index.js';
import { prepareReal } from '../packages/eval/src/pipeline.js';
import { STATE_SPACE } from '../packages/core/src/presets/state-space.js';
import { STATE_SPACE_DEFAULTS } from '../packages/core/src/state-space/filter.js';

const data = await loadData(new URL('../data', import.meta.url).pathname);
const prep = prepareReal(data, { holdout: false });
const tl = truncateTimeline(prep.timeline, 2009);
const idx = indexTimeline(tl, prep.identity);
const params = worldParamsV2(worldFromHyper);

// ---- 1) v1 is untouched: a world without `version` is the v1 world, and asking for 2 is explicit ---------------------------------
{
  const v1 = syntheticWorld(tl, idx, 'race', { ...worldFromHyper({ ...STATE_SPACE_DEFAULTS, ...STATE_SPACE.race }) }, 3);
  const v1b = syntheticWorld(tl, idx, 'race', { ...worldFromHyper({ ...STATE_SPACE_DEFAULTS, ...STATE_SPACE.race }), version: 1 }, 3);
  assert.deepEqual(
    v1.timeline.map((w) => w.obs.race.map((o) => o.o)),
    v1b.timeline.map((w) => w.obs.race.map((o) => o.o)),
    'version 1 is the v1 world',
  );
  assert.equal(params.version, 2);
  assert.ok(WORLD_V2_DEFAULTS.version === 2);
  console.log('PASS v1 behaviour: no `version` (or 1) is the v1 world');
}

// ---- 2) deterministic, and the observations are the exam's own kinds ----------------------------------------------------------------
const w1 = syntheticWorld(tl, idx, 'race', params, 1);
{
  const again = syntheticWorld(tl, idx, 'race', params, 1);
  assert.deepEqual(
    w1.timeline.map((w) => w.obs.race),
    again.timeline.map((w) => w.obs.race),
    'same seed, same world',
  );
  const other = syntheticWorld(tl, idx, 'race', params, 2);
  assert.notDeepEqual(
    w1.timeline.map((w) => w.obs.race.map((o) => o.o)),
    other.timeline.map((w) => w.obs.race.map((o) => o.o)),
    'another seed, another world',
  );
  const sources = new Map();
  let bad = 0;
  for (const w of w1.timeline)
    for (const o of w.obs.race) {
      sources.set(o.src, (sources.get(o.src) ?? 0) + 1);
      if (!(o.w > 0) || (o.o !== 0 && o.o !== 1) || o.x === o.y || o.same !== (o.cx === o.cy)) bad++;
    }
  assert.equal(bad, 0, 'every observation has a positive weight, a binary outcome, two drivers and a consistent teammate flag');
  for (const src of ['finish', 'paceW', 'partial']) assert.ok(sources.get(src) > 100, `source ${src} is produced (${sources.get(src)})`);
  assert.equal(sources.get('pace') ?? 0, 0, 'disjoint race windows do not create a synthetic pace fallback');
  // the other session keeps the real observations; the requested one is replaced
  assert.deepEqual(
    w1.timeline.map((w) => w.obs.qual),
    tl.map((w) => w.obs.qual),
    'a race world leaves the real qualifying observations alone',
  );
  const q1 = syntheticWorld(tl, idx, 'qual', params, 1);
  const qs = new Set(q1.timeline.flatMap((w) => w.obs.qual.map((o) => o.src)));
  assert.deepEqual([...qs], ['qual'], 'qualifying observations come from simulated times');
  assert.ok(
    q1.timeline.some((w, i) => w.obs.qual.length && JSON.stringify(w.obs.qual) !== JSON.stringify(tl[i].obs.qual)),
    'and they are not the real ones',
  );
  console.log(
    `PASS v2 worlds are deterministic and made of the exam's observation kinds (${[...sources].map(([k, v]) => `${k} ${v}`).join(', ')})`,
  );
}

// ---- 3) race and qualifying share their latent world (correlated, not equal) --------------------------------------------------------
{
  const q1 = syntheticWorld(tl, idx, 'qual', params, 1);
  const xs = [];
  const ys = [];
  w1.truth.drivers.forEach((m, i) => {
    for (const [d, v] of m) {
      const u = q1.truth.drivers[i].get(d);
      if (Number.isFinite(u)) {
        xs.push(v);
        ys.push(u);
      }
    }
  });
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(xs);
  const my = mean(ys);
  const r =
    xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) /
    Math.sqrt(xs.reduce((s, v) => s + (v - mx) ** 2, 0) * ys.reduce((s, v) => s + (v - my) ** 2, 0));
  assert.ok(r > 0.3 && r < 0.97, `race and qualifying driver truth are correlated, not equal (r = ${r.toFixed(2)})`);
  console.log(`PASS race and qualifying truth correlation ${r.toFixed(2)}`);
}

// ---- 4) the shipped filter forecasts a v2 world about as well as the real data: loose bands, by source ------------------------------
{
  const run = stateSpaceRun(w1.timeline, 'race', prep.ctx, {});
  const rows = observationRows(indexTimeline(w1.timeline, prep.identity), run);
  const c = fitSlope(rows.filter((r) => r.year <= 2007));
  const loss = (pick) => {
    const sel = rows.filter((r) => r.year >= 2008 && pick(r));
    return sel.reduce((a, r) => a + r.w * nll(c * r.z, r.o), 0) / sel.reduce((a, r) => a + r.w, 0);
  };
  const finish = loss((r) => r.src === 'finish');
  const paceW = loss((r) => r.src === 'paceW');
  assert.ok(finish > 0.25 && finish < 0.5, `finish loss ${finish.toFixed(3)} in the band (real 0.39)`);
  assert.ok(paceW > 0.25 && paceW < 0.5, `paceW loss ${paceW.toFixed(3)} in the band (real 0.37)`);
  assert.ok(c > 0.7 && c < 1.3, `calibration multiplier ${c.toFixed(2)} near 1`);
  console.log(`PASS the shipped filter on a v2 world: finish ${finish.toFixed(3)}, paceW ${paceW.toFixed(3)}, multiplier ${c.toFixed(2)}`);
}

console.log('v2 simulator tests passed.');
