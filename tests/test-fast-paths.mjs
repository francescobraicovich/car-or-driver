// The search relies on two shortcuts. Each must agree with the straightforward
// implementation, or a search would optimise something other than the model.
//
//  1. headToHeadWithHazard has a closed form; the per-lap loop it replaced is kept here
//     as the reference.
//  2. createScorer (lean build + cache + truncation) must return exactly the
//     score of evaluate() on the full, unshortcut build.
import { headToHeadWithHazard } from '../packages/core/src/hazard.js';
import { clamp } from '../packages/core/src/math.js';
import { mulberry32 } from '../packages/core/src/tuning.js';

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
