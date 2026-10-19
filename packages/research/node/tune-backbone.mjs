// Search space and helpers for retuning the Elo rating core WITHOUT touching the exam.
//
// Two invariants:
//   1. Exam-defining params stay frozen, so the weights and observations are bit-identical
//      (packages/research/node/verify-exam-invariance.mjs proves it).
//   2. The objective window stops at 2007 (or 2011), so the forecast-model selection on 2008-2015
//      and the 2016+ window stay clean.
//
// Usage: node packages/research/node/tune-backbone.mjs --phase uniform|refine --shard I --from 2008 --to 2011
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadData, evaluate } from './common.mjs';
import { TUNED_ELO } from '../../core/src/presets/tuned-elo.js';
import { mulberry32 } from '../../core/src/tuning.js';
import { EXAM_KEYS } from '../../core/src/exam.js';

export const FREE_SPACE = [
  { key: 'kd', min: 5, max: 80, step: 1 },
  { key: 'kc', min: 2, max: 160, step: 2 },
  { key: 'carCarry', min: 0, max: 0.8, step: 0.05 },
  { key: 'qkd', min: 2, max: 30, step: 1 },
  { key: 'qkc', min: 2, max: 160, step: 2 },
  { key: 'qCarCarry', min: 0, max: 0.8, step: 0.05 },
  { key: 'qualWeight', min: 0.1, max: 0.7, step: 0.05 },
  { key: 'circK', min: 0, max: 15, step: 0.5 },
  { key: 'circCarry', min: 0, max: 0.9, step: 0.1 },
  { key: 'gridAdv', min: 0, max: 30, step: 1 },
  { key: 'gridAdvRefuel', min: 0, max: 30, step: 1 },
  { key: 'homeAdv', min: 0, max: 30, step: 2 },
  { key: 'rookieBoost', min: 1, max: 5, step: 0.5 },
  { key: 'rookieN', min: 5, max: 30, step: 5 },
  { key: 'wetK', min: 0, max: 12, step: 1 },
  { key: 'scale', min: 75, max: 700, step: 25 },
  { key: 'hazardW', min: 0, max: 1, step: 0.25 },
  // Hazard shape — never searched in earlier passes.
  { key: 'relHalf', min: 5, max: 60, step: 5 },
  { key: 'relPrior', min: 100, max: 1500, step: 100 },
  { key: 'relWinter', min: 0, max: 1, step: 0.05 },
  { key: 'incHalf', min: 5, max: 80, step: 5 },
  { key: 'incPrior', min: 100, max: 2000, step: 100 },
  { key: 'stdLaps', min: 30, max: 90, step: 5 },
  // Season-shape mechanisms. kcEarly 1 and regCarry 1 are exact no-ops, so the
  // search can switch either off and the 23-parameter result stays reachable.
  { key: 'kcEarly', min: 1, max: 12, step: 0.25 },
  { key: 'kcTau', min: 0.5, max: 30, step: 0.5 },
  { key: 'regCarry', min: 0, max: 1, step: 0.05 },
  // How hard a teammate pair teaches the driver ratings, on top of tmBoost.
  // Scoring weight is NOT affected: tmBoost/qTmBoost stay frozen, so the exam
  // is untouched and verify-exam-invariance.mjs still hashes identical.
  { key: 'tmLearn', min: 0.125, max: 30, step: 0.125 },
  { key: 'qTmLearn', min: 0.125, max: 30, step: 0.125 },
];
// The keys that enter the observation weight w, or decide which observations
// exist, are EXAM_KEYS (packages/core/src/exam.js) and are never searched.
export { EXAM_KEYS as FROZEN_KEYS };
// Tuning window is a CLI argument because it turned out to be the decisive
// choice: backbone quality is ~0.97 correlated across 2008->2026 but ~0
// correlated with 2000-2007 (research/backbone/era-transfer.json). A window
// spanning both regimes optimises a mixture and lands nowhere.
export const windowFor = (lo, hi) => ({ fromYear: +lo, toYear: +hi, burnIn: 20, objective: 'full' });

const dec = (step) => {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};
const snap = (d, raw) => +(Math.round(Math.min(d.max, Math.max(d.min, raw)) / d.step) * d.step).toFixed(dec(d.step));
export const drawUniform = (rng, base = TUNED_ELO) => {
  const c = { ...base };
  for (const d of FREE_SPACE) c[d.key] = snap(d, d.min + rng() * (d.max - d.min));
  return c;
};
// Gaussian perturbation of a few coordinates, radius as a fraction of range.
function perturb(base, rng, radius, ndims) {
  const c = { ...base };
  const idx = [...FREE_SPACE.keys()];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  for (const k of idx.slice(0, ndims)) {
    const d = FREE_SPACE[k];
    const g = Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());
    c[d.key] = snap(d, base[d.key] + g * radius * (d.max - d.min));
  }
  return c;
}

// A walk-forward score over [from, to] cannot see a race after `to`, so drop
// them before searching. Verified identical in --phase verify. ~2.5x faster.
export function truncate(ctx, toYear) {
  const keep = new Set(ctx.raw.races.filter((r) => +r.year <= toYear).map((r) => String(r.raceId)));
  const raw = {
    ...ctx.raw,
    races: ctx.raw.races.filter((r) => +r.year <= toYear),
    results: ctx.raw.results.filter((r) => keep.has(String(r.raceId))),
    qualifying: ctx.raw.qualifying.filter((r) => keep.has(String(r.raceId))),
  };
  return {
    raw,
    maps: ctx.maps,
    lapSnapshots: new Map([...ctx.lapSnapshots].filter(([k]) => keep.has(String(k).split('|')[0]))),
    lapPace: new Map([...ctx.lapPace].filter(([k]) => keep.has(String(k)))),
  };
}

const arg = (k, dflt) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? dflt : process.argv[i + 1];
};
const OUT = 'research/backbone';

async function main() {
  const phase = arg('phase', 'uniform');
  const shard = +arg('shard', 0);
  const n = +arg('n', 750);
  const WIN = windowFor(arg('from', 2008), arg('to', 2011));
  const tag = `${WIN.fromYear}_${WIN.toYear}`;
  const full = await loadData('data');
  const ctx = truncate(full, WIN.toYear);
  await mkdir(OUT, { recursive: true });
  const t0 = performance.now();
  const seen = [];
  let best = null;
  const score = (p) => evaluate(p, ctx, WIN).score;

  if (phase === 'quick') {
    // Budgeted multi-start local search. Explore briefly, then exploit — the
    // long runs showed ~85% of the refinement gain lands in the first ~15% of
    // steps, so a short chain from a good start captures most of it.
    const budgetMs = +arg('budget', 15) * 1000;
    // Warm starts dominate at this budget (0.3154 vs 0.3304 for cold starts in
    // a 15s run), so most shards polish the incumbent and two still explore so
    // the tool can escape the incumbent's basin if a better one exists.
    const warm = shard % 4 !== 0;
    const rng = mulberry32(4100 + shard + 13 * WIN.fromYear);
    const t1 = performance.now();
    let cur;
    if (warm) {
      cur = { score: score(TUNED_ELO), params: { ...TUNED_ELO } };
    } else {
      const explore = t1 + budgetMs * 0.3;
      cur = null;
      do {
        const cand = drawUniform(rng);
        const sc = score(cand);
        seen.push({ score: sc, params: cand });
        if (!cur || sc < cur.score) cur = { score: sc, params: cand };
      } while (performance.now() < explore);
    }
    best = { ...cur };
    seen.push({ ...cur });
    // Anneal against elapsed budget rather than a step count, so the schedule
    // is the same shape whatever the machine's speed.
    while (performance.now() - t1 < budgetMs) {
      const frac = (performance.now() - t1) / budgetMs;
      const radius = 0.16 * Math.pow(0.01 / 0.16, frac);
      const cand = perturb(cur.params, rng, radius, Math.max(1, Math.round(3 - 2 * frac)));
      const sc = score(cand);
      seen.push({ score: sc, params: cand });
      if (sc < cur.score) {
        cur = { score: sc, params: cand };
        if (sc < best.score) best = { ...cur };
      }
    }
    console.log(
      `[q${shard}${warm ? 'w' : 'x'}] ${seen.length} evals in ${((performance.now() - t1) / 1000).toFixed(1)}s best=${best.score.toFixed(6)}`,
    );
  } else if (phase === 'uniform') {
    // Distinct seed per shard; draws are independent, so shards never overlap.
    const rng = mulberry32(7000 + shard + 13 * WIN.fromYear);
    for (let i = 0; i < n; i++) {
      const cand = drawUniform(rng);
      const s = score(cand);
      seen.push({ score: s, params: cand });
      if (!best || s < best.score) {
        best = { score: s, params: cand };
        console.log(`[u${shard} ${i + 1}/${n}] best ${s.toFixed(5)}`);
      }
    }
  } else {
    const starts = JSON.parse(await readFile(`${OUT}/starts-${tag}.json`, 'utf8'));
    let cur = starts[shard % starts.length];
    best = { ...cur };
    const rng = mulberry32(9000 + shard + 13 * WIN.fromYear);
    for (let i = 0; i < n; i++) {
      // Anneal the neighbourhood: broad early, single-step by the end.
      const frac = i / n;
      const radius = 0.2 * Math.pow(0.01 / 0.2, frac);
      const ndims = Math.max(1, Math.round(4 - 3 * frac));
      const cand = perturb(cur.params, rng, radius, ndims);
      const s = score(cand);
      seen.push({ score: s, params: cand });
      if (s < cur.score) {
        cur = { score: s, params: cand };
        if (s < best.score) {
          best = { score: s, params: cand };
          console.log(`[r${shard} ${i + 1}/${n}] best ${s.toFixed(5)} radius=${radius.toFixed(4)}`);
        }
      }
    }
  }
  seen.sort((a, b) => a.score - b.score);
  await writeFile(
    `${OUT}/${phase}-${tag}-${shard}.json`,
    JSON.stringify(
      {
        phase,
        shard,
        n: seen.length,
        window: WIN,
        frozen: Object.fromEntries(EXAM_KEYS.map((k) => [k, TUNED_ELO[k]])),
        seconds: Math.round((performance.now() - t0) / 1000),
        best,
        top: seen.slice(0, 40),
      },
      null,
      2,
    ),
  );
  console.log(`[${phase}${shard}] ${seen.length} evals in ${Math.round((performance.now() - t0) / 1000)}s best=${best.score.toFixed(6)}`);
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
