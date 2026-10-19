// The full metric suite on named configurations, real data through 2015 (2016+ only with --holdout, a second look).
//   node packages/research/node/suite.mjs [--configs base,final] [--json out.json] [--holdout]
import { writeFileSync } from 'node:fs';
import { stateSpaceRun } from '../../eval/src/index.js';
import { CONFIGS, load } from './strict-eval.mjs';
import { computeSuite } from './metric-suite.mjs';

const argv = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i < 0 ? d : argv[i + 1];
};
export const fmt = (v) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(4)) : 'n/a');
if (process.argv[1]?.endsWith('suite.mjs')) {
  const hold = argv.includes('--holdout');
  const env = await load(hold ? 9999 : 2015, hold);
  const qual = stateSpaceRun(env.timeline, 'qual', env.prep.ctx, env.base.qual);
  const names = String(opt('configs', 'base,final')).split(',');
  const res = {};
  for (const n of names) res[n] = computeSuite(env, CONFIGS[n] ?? JSON.parse(n), qual).m;
  const keys = Object.keys(res[names[0]]);
  console.log(`${'metric'.padEnd(34)}${names.map((n) => n.padStart(14)).join('')}`);
  for (const k of keys) console.log(`${k.padEnd(34)}${names.map((n) => fmt(res[n][k]).padStart(14)).join('')}`);
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify(res, null, 1));
}
