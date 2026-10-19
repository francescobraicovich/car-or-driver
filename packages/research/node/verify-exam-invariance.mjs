// Proves the claim tune-backbone.mjs depends on: retuning the FREE
// params cannot change the exam. The exam is the multiset of
// (raceId, session, driverA, driverB, label, weight) the backtest scores.
// If this ever fails, the free/frozen split is wrong and every backbone
// comparison downstream is invalid — a candidate would be able to win by
// making the test easier instead of by predicting better.
import { createHash } from 'node:crypto';
import { loadData } from './common.mjs';
import { buildEloCore } from '../../core/src/elo-core.js';
import { TUNED_ELO } from '../../core/src/presets/tuned-elo.js';
import { mulberry32 } from '../../core/src/tuning.js';
import { FREE_SPACE, FROZEN_KEYS, drawUniform } from './tune-backbone.mjs';

function examHash(ctx, params) {
  const h = createHash('sha256');
  let n = 0;
  buildEloCore(ctx.raw, ctx.lapSnapshots, ctx.maps, params, ctx.lapPace, {
    observation: ({ info, ob, session, weight }) => {
      n++;
      h.update(`${info.raceId}|${session}|${ob.x.driverId}|${ob.y.driverId}|${ob.obs}|${weight.toExponential(17)}\n`);
    },
  });
  return { hash: h.digest('hex'), n };
}

const ctx = await loadData('data');
let ok = true;
const ref = examHash(ctx, TUNED_ELO);
console.log(`reference settings       n=${ref.n} ${ref.hash.slice(0, 32)}`);
const rng = mulberry32(99);
for (let i = 0; i < 8; i++) {
  const got = examHash(ctx, drawUniform(rng));
  const same = got.hash === ref.hash;
  ok &&= same;
  console.log(`free draw ${i}              n=${got.n} ${got.hash.slice(0, 32)} ${same ? 'identical' : 'EXAM CHANGED'}`);
}
// Negative controls: each frozen key must move the hash, or the freeze is vacuous.
for (const k of ['orderW', 'tmBoost', 'alpha', 'cap', 'partialExp', 'paceW', 'qTmBoost']) {
  const bump = { alpha: 0.35, cap: 3.5, partialExp: 1.2, paceW: 1.25 }[k] ?? TUNED_ELO[k] + 1;
  const moved = examHash(ctx, { ...TUNED_ELO, [k]: bump }).hash !== ref.hash;
  ok &&= moved;
  console.log(`control ${k.padEnd(12)}     ${moved ? 'changes the exam (expected)' : 'NO EFFECT — freeze is vacuous'}`);
}
console.log(`\nfree: ${FREE_SPACE.length} params   frozen: ${FROZEN_KEYS.join(', ')}`);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
