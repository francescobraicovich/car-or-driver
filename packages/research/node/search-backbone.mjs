// Parallel annealed search for the Elo rating core. About 80 s at the
// default budget on a 10-core laptop (600 evals: ~50 s, 1200: ~100 s); see
// docs/elo.md for the measurements behind every default.
//
//   node packages/research/node/search-backbone.mjs [--space full|reduced] [--chains 8]
//        [--evals 1000] [--from 2008] [--to 2011] [--seed 1] [--out research/backbone/search.json]
//
// Each chain is an independent annealed local search over the unit cube (moves
// touch 1-4 parameters with a shrinking Gaussian radius), so wall time is one
// chain's time and the best chain wins. Half the chains start from the shipped
// backbone (they cannot end up worse than it); half start cold from the best of
// a short uniform sample, so the search can leave the incumbent's basin.
//
// Schedules are counted in evaluations, not seconds, so a seeded run is
// reproducible. Exam-defining parameters are never touched (EXAM_KEYS), and the
// winner is rounded and re-scored so what is reported is what would ship.
import { fork } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { loadData } from './common.mjs';
import { FREE_SPACE } from './tune-backbone.mjs';
import { TUNED_ELO as INCUMBENT } from '../../core/src/presets/tuned-elo.js';
import { EXAM_KEYS } from '../../core/src/exam.js';
import { createScorer, mulberry32 } from '../../core/src/tuning.js';

// The parameters with a measurable effect on the objective, from the sensitivity
// study (docs/elo.md); the rest are pinned at the incumbent's values. Kept as
// an option, but NOT the default: at equal budget the full space found equal or
// slightly better points (0.35052/0.35058 vs 0.35061/0.35082 at 600 evals).
export const REDUCED_KEYS = [
  'scale',
  'gridAdv',
  'gridAdvRefuel',
  'kd',
  'kc',
  'kcEarly',
  'hazardW',
  'homeAdv',
  'qkc',
  'qTmLearn',
  'tmLearn',
  'carCarry',
  'stdLaps',
  'regCarry',
];

export function spaceFor(name) {
  const dims = name === 'full' ? FREE_SPACE : FREE_SPACE.filter((d) => REDUCED_KEYS.includes(d.key));
  if (name !== 'full' && dims.length !== REDUCED_KEYS.length) throw Error('REDUCED_KEYS contains a key that is not searchable');
  return dims;
}

const arg = (k, dflt) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? dflt : process.argv[i + 1];
};

const fromUnit = (dims, u) => Object.fromEntries(dims.map((d, i) => [d.key, d.min + u[i] * (d.max - d.min)]));
const toUnit = (dims, params) => dims.map((d) => (params[d.key] - d.min) / (d.max - d.min));
const gauss = (rng) => Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());

/** One annealed chain. Returns the best unit-cube point and its score. */
export function runChain({ dims, score, seed, evals, warm, onImprove }) {
  const rng = mulberry32(seed);
  const params = (u) => ({ ...INCUMBENT, ...fromUnit(dims, u) });
  let cur;
  let used = 0;
  if (warm) {
    const u = toUnit(dims, INCUMBENT);
    cur = { u, score: score(params(u)) };
    used = 1;
  } else {
    const n0 = Math.max(1, Math.round(evals / 10));
    for (; used < n0; used++) {
      const u = dims.map(() => rng());
      const s = score(params(u));
      if (!cur || s < cur.score) cur = { u, score: s };
    }
  }
  let best = cur;
  const [r0, r1] = warm ? [0.08, 0.004] : [0.2, 0.01];
  const steps = evals - used;
  for (let i = 0; i < steps; i++) {
    const frac = i / Math.max(1, steps);
    const radius = r0 * (r1 / r0) ** frac;
    const ndims = Math.min(dims.length, Math.max(1, Math.round(4 - 3 * frac)));
    const u = cur.u.slice();
    const idx = dims.map((_, k) => k);
    for (let k = idx.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [idx[k], idx[j]] = [idx[j], idx[k]];
    }
    for (const k of idx.slice(0, ndims)) u[k] = Math.min(1, Math.max(0, u[k] + gauss(rng) * radius));
    const s = score(params(u));
    if (s < cur.score) {
      cur = { u, score: s };
      if (s < best.score) {
        best = cur;
        onImprove?.(used + i + 1, s);
      }
    }
  }
  return { u: best.u, score: best.score, evals };
}

const round4 = (v) => +v.toFixed(4);

async function childMain() {
  const opts = JSON.parse(arg('chain-opts'));
  const dims = spaceFor(opts.space);
  const ctx = await loadData('data');
  const score = createScorer(ctx, { fromYear: opts.from, toYear: opts.to, burnIn: 20, objective: 'full' });
  const t0 = performance.now();
  const res = runChain({ dims, score, seed: opts.seed, evals: opts.evals, warm: opts.warm });
  // Round what would be written to the preset, and score exactly that.
  const shipped = { ...INCUMBENT, ...Object.fromEntries(Object.entries(fromUnit(dims, res.u)).map(([k, v]) => [k, round4(v)])) };
  for (const k of EXAM_KEYS) if (shipped[k] !== INCUMBENT[k]) throw Error(`exam key ${k} changed`);
  process.send({
    chain: opts.chain,
    warm: opts.warm,
    unroundedScore: res.score,
    score: score(shipped),
    params: shipped,
    evals: res.evals,
    seconds: (performance.now() - t0) / 1000,
  });
}

async function main() {
  const opts = {
    space: arg('space', 'full'),
    chains: +arg('chains', Math.min(8, availableParallelism())),
    evals: +arg('evals', 1000),
    from: +arg('from', 2008),
    to: +arg('to', 2011),
    seed: +arg('seed', 1),
  };
  const out = arg('out', 'research/backbone/search.json');
  const dims = spaceFor(opts.space);
  console.log(
    `searching ${dims.length} parameters (${opts.space}), ${opts.chains} chains x ${opts.evals} evals, window ${opts.from}-${opts.to}`,
  );
  const t0 = performance.now();
  const self = fileURLToPath(import.meta.url);
  const results = await Promise.all(
    Array.from({ length: opts.chains }, (_, chain) => {
      const chainOpts = { ...opts, chain, warm: chain % 2 === 1, seed: opts.seed * 1000 + chain };
      return new Promise((resolve, reject) => {
        const child = fork(self, ['--chain-opts', JSON.stringify(chainOpts)]);
        child.on('message', (m) => {
          console.log(`chain ${m.chain} ${m.warm ? 'warm' : 'cold'}  ${m.score.toFixed(6)}  (${m.seconds.toFixed(0)}s)`);
          resolve(m);
        });
        child.on('error', reject);
        child.on('exit', (code) => code && reject(Error(`chain ${chain} exited with ${code}`)));
      });
    }),
  );
  const seconds = (performance.now() - t0) / 1000;
  results.sort((a, b) => a.score - b.score);
  const best = results[0];
  const summary = {
    config: opts,
    seconds: Math.round(seconds),
    incumbent: 'see research/backbone/protocol-4.json',
    best: { score: best.score, warm: best.warm, chain: best.chain, params: best.params },
    chains: results.map(({ params: _params, ...rest }) => rest),
  };
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`best ${best.score.toFixed(6)} (${best.warm ? 'warm' : 'cold'} chain ${best.chain}) in ${seconds.toFixed(0)}s -> ${out}`);
}

if (process.argv.includes('--chain-opts')) await childMain();
else if (import.meta.url === `file://${process.argv[1]}`) await main();
