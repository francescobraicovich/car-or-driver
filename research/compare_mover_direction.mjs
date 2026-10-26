// Paired move-cluster bootstrap for pre-move teammate ordering, not pair-level resampling.
import assert from 'node:assert/strict';
import { stateSpaceRun } from '../packages/eval/src/index.js';
import { qualLink } from '../packages/core/src/state-space/qualifying-link.js';
import { strictItems } from '../packages/research/node/mover-strict.mjs';
import { FINAL, load } from '../packages/research/node/strict-eval.mjs';
import { componentExposure, discriminativeRanking } from './alternative_rating_models.mjs';

const env = await load(2025, true);
const { timeline, prep, base, idx, moves } = env;
const qual = stateSpaceRun(timeline, 'qual', prep.ctx, base.qual);
const current = stateSpaceRun(timeline, 'race', { ...prep.ctx, ...qualLink(qual.raw, FINAL.beta, FINAL.gamma) }, { ...base.race, ...FINAL.race });
const alternative = discriminativeRanking(timeline, 'race', prep.ctx.carOf, componentExposure(timeline, prep.data.raw.races));
const a = strictItems(idx, current, moves, 5).filter((item) => item.kind === 'tm');
const b = strictItems(idx, alternative, moves, 5).filter((item) => item.kind === 'tm');
assert.equal(a.length, b.length);
const hit = (item) => Math.abs(item.z) < 1e-10 ? 0.5 : Number((item.z > 0) === !!item.o);
const windows = [['2002-11', 2002, 2011], ['2012-15', 2012, 2015], ['2016-25', 2016, 2025]];
let seed = 713331;
const random = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
for (const [name, first, last] of windows) {
  const clusters = new Map();
  for (let i = 0; i < a.length; i++) {
    assert.equal(`${a[i].driverId}:${a[i].t0}:${a[i].year}:${a[i].o}:${a[i].w}`, `${b[i].driverId}:${b[i].t0}:${b[i].year}:${b[i].o}:${b[i].w}`);
    if (a[i].year < first || a[i].year > last) continue;
    const key = `${a[i].driverId}:${a[i].t0}`;
    if (!clusters.has(key)) clusters.set(key, { weight: 0, gain: 0 });
    const cluster = clusters.get(key);
    cluster.weight += a[i].w;
    cluster.gain += a[i].w * (hit(b[i]) - hit(a[i]));
  }
  const values = [...clusters.values()];
  const gain = values.reduce((sum, value) => sum + value.gain, 0) / values.reduce((sum, value) => sum + value.weight, 0);
  const draws = [];
  for (let repetition = 0; repetition < 5000; repetition++) {
    let numerator = 0;
    let denominator = 0;
    for (let draw = 0; draw < values.length; draw++) {
      const value = values[Math.floor(random() * values.length)];
      numerator += value.gain;
      denominator += value.weight;
    }
    draws.push(numerator / denominator);
  }
  draws.sort((x, y) => x - y);
  console.log(JSON.stringify({ window: name, moves: values.length, accuracyGain: gain, interval95: [draws[125], draws[4875]] }));
}
