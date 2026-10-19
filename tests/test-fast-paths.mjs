// The search relies on two shortcuts. Each must agree with the straightforward
// implementation, or a search would optimise something other than the model.
//
//  1. headToHeadWithHazard has a closed form; the per-lap loop it replaced is kept here
//     as the reference.
//  2. createScorer (lean build + cache + truncation) must return exactly the
//     score of evaluate() on the full, unshortcut build.
import { loadData, evaluate } from '../packages/research/node/common.mjs';
import { FREE_SPACE } from '../packages/research/node/tune-backbone.mjs';
import { headToHeadWithHazard } from '../packages/core/src/hazard.js';
import { clamp } from '../packages/core/src/math.js';
import { TUNED_ELO } from '../packages/core/src/presets/tuned-elo.js';
import { buildEloCore } from '../packages/core/src/elo-core.js';
import { createScorer, mulberry32 } from '../packages/core/src/tuning.js';

const fail = (msg) => {
  console.error(`FAIL ${msg}`);
  process.exit(1);
};

// 1) closed form vs the original per-lap loop
function headToHeadLoop(pPace, qA, qB, L) {
  qA = clamp(qA, 1e-9, 0.2);
  qB = clamp(qB, 1e-9, 0.2);
  L = Math.max(1, Math.round(L));
  const sA = (1 - qA) ** L;
  const sB = (1 - qB) ** L;
  let p = sA * sB * pPace + sA * (1 - sB);
  for (let m = 1; m <= L; m++) {
    const pAf = (1 - qA) ** (m - 1) * qA;
    const bBefore = 1 - (1 - qB) ** (m - 1);
    const bSame = (1 - qB) ** (m - 1) * qB;
    p += pAf * (bBefore + 0.5 * bSame);
  }
  return clamp(p, 1e-6, 1 - 1e-6);
}
const rng = mulberry32(2024);
let worst = 0;
for (let i = 0; i < 100000; i++) {
  const qA = 10 ** (-9 + 8.4 * rng());
  const qB = 10 ** (-9 + 8.4 * rng());
  const L = 1 + Math.floor(rng() * 90);
  const pPace = rng();
  worst = Math.max(worst, Math.abs(headToHeadWithHazard(pPace, qA, qB, L) - headToHeadLoop(pPace, qA, qB, L)));
}
if (worst > 1e-12) fail(`closed-form headToHeadWithHazard differs from the loop by ${worst}`);
console.log(`PASS closed-form headToHeadWithHazard matches the per-lap loop (max |diff| ${worst.toExponential(1)})`);

// 2) fast scorer == full evaluation, and a lean build keeps every diag value
const ctx = await loadData('data');
const window = { fromYear: 2008, toYear: 2011, burnIn: 20, objective: 'full' };
const score = createScorer(ctx, window);
const draws = [TUNED_ELO];
for (let i = 0; i < 6; i++) {
  draws.push({ ...TUNED_ELO, ...Object.fromEntries(FREE_SPACE.map((d) => [d.key, d.min + rng() * (d.max - d.min)])) });
}
for (const [i, p] of draws.entries()) {
  const want = evaluate(p, ctx, window).score;
  const got = score(p);
  if (want !== got) fail(`createScorer differs from evaluate() on draw ${i}: ${got} vs ${want}`);
}
console.log(`PASS createScorer is bit-identical to evaluate() on ${draws.length} parameter sets`);

const args = [ctx.raw, ctx.lapSnapshots, ctx.maps, TUNED_ELO, ctx.lapPace];
const full = buildEloCore(...args);
const lean = buildEloCore(...args, null, { lean: true, cache: {} });
if (full.snaps.length !== lean.snaps.length) fail('lean build has a different number of weekends');
// `disruptions` only feeds the audit table, so a lean build reports 0 for it.
for (const [i, s] of full.snaps.entries()) {
  const a = { ...s.diag, q: { ...s.diag.q, disruptions: 0 } };
  const b = { ...lean.snaps[i].diag, q: { ...lean.snaps[i].diag.q, disruptions: 0 } };
  if (JSON.stringify(a) !== JSON.stringify(b)) fail(`lean diag differs at weekend ${i}`);
}
console.log(`PASS lean build reproduces every weekend diagnostic (${full.snaps.length} weekends)`);
