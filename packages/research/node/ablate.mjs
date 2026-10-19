// Real-data ablation of the final model (strict mover scores): retune only, link only, both. Output: research/eval/ablation-strict.txt
import { stateSpaceRun } from '../../eval/src/index.js';
import { evalConfig, FINAL, load, SHIPPED } from './strict-eval.mjs';

const f = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
const env = await load(9999, true);
const qual = stateSpaceRun(env.timeline, 'qual', env.prep.ctx, env.base.qual);
const RETUNE = { ...SHIPPED, rateA: false };
const CONFIGS = {
  baseline: { beta: 0, gamma: 0, race: {} },
  'retune only (no link)': { beta: 0, gamma: 0, race: RETUNE },
  'link only (old settings)': { beta: FINAL.beta, gamma: FINAL.gamma, race: { rateA: false } },
  'link + retune but no team-fit A': { beta: FINAL.beta, gamma: FINAL.gamma, race: { ...RETUNE, sdA: 0 } },
  'driver link only (gamma 0) + retune': { beta: FINAL.beta, gamma: 0, race: RETUNE },
  'car link only (beta 0) + retune': { beta: 0, gamma: FINAL.gamma, race: RETUNE },
  'final (link + retune + A)': FINAL,
};
for (const [name, cfg] of Object.entries(CONFIGS)) {
  const r = evalConfig(env, cfg, qual);
  const s = r.strict;
  const tm = (w) => (s[`${w}.k5`].tmLoss + s[`${w}.k10`].tmLoss) / 2;
  const fd = (w) => (s[`${w}.k5`].fdLoss + s[`${w}.k10`].fdLoss) / 2;
  console.log(
    `${name.padEnd(38)} tm ${f(tm('2002-11'))} ${f(tm('2012-15'))} ${f(tm('2016+'))} | fd ${f(fd('2002-11'))} ${f(fd('2012-15'))} ${f(fd('2016+'))} | P w2 ${f(r.loss['w2.combined.all'])} w3 ${f(r.loss['w3.combined.all'])} | tm slope k5 ${f(s['2002-11.k5'].tmSlope, 2)} ${f(s['2012-15.k5'].tmSlope, 2)} ${f(s['2016+.k5'].tmSlope, 2)}`,
  );
}
