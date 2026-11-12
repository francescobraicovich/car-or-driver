// Runs every test in sequence; fails fast with the failing test's output.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TESTS = [
  'test-continuous-form.mjs',
  'golden.mjs',
  'test-fast-paths.mjs',
  'test-qualifying-outliers.mjs',
  'test-short-race.mjs',
  'test-lap-overlap.mjs',
  'test-weekend-integrity.mjs',
  'test-evidence-integrity.mjs',
  'test-backtest-integrity.mjs',
  'test-charts.mjs',
  'test-rating-reference.mjs',
  'test-chart-math.mjs',
  'test-dom-ids.mjs',
  'test-head-to-head-breakdown.mjs',
  'test-form-shift.mjs',
  'test-form-state.mjs',
  'test-current-form-candidates.mjs',
  'test-scenario.mjs',
  'test-scenario-effects.mjs',
  'test-state-space.mjs',
  'test-hybrid.mjs',
  'test-rating-principles.mjs',
  'test-teammate-graph-core.mjs',
  'test-teammate-graph-exam.mjs',
  'test-graph-evidence.mjs',
  'test-unified-ratings.mjs',
  'test-unified-production.mjs',
  'test-retrospective-projection.mjs',
  'test-retrospective-publication.mjs',
  'test-unified-grid.mjs',
  'test-graph-rating-principles.mjs',
  'test-graph-production.mjs',
  'test-state-space-forecast.mjs',
  'test-eval.mjs',
  'test-chronological-validation.mjs',
  'test-evaluation-diagnostics.mjs',
  'test-graph-car-research.mjs',
  'test-stable-rating-metrics.mjs',
  'test-frozen-mover-predictions.mjs',
  'test-transfer-learning-rules.mjs',
  'test-temporal-teammate-graph.mjs',
  'test-temporal-rating-principles.mjs',
  'test-stable-simulation.mjs',
  'test-rane-benchmark.mjs',
  'test-literature-benchmark.mjs',
  'test-synthetic-v2.mjs',
  'test-data-manifest.mjs',
  'test-gp-refresh.mjs',
  'test-gp-build.mjs',
  'test-model-file.mjs',
  'test-race-laps.mjs',
  'test-compliance.mjs',
  'test-stage.mjs',
  'test-stage-models.mjs',
  'test-stage-model-motion.mjs',
  'test-insights.mjs',
  'test-layering.mjs',
  'test-teammate-graph.mjs',
  'test-site-imports.mjs',
  'test-repository-structure.mjs',
  'test-build-pages.mjs',
];

for (const t of TESTS) {
  console.log(`\n# ${t}`);
  const r = spawnSync(process.execPath, [`tests/${t}`], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\nFAILED: ${t}`);
    process.exit(r.status || 1);
  }
}
for (const test of [
  'unified-ratings/test_model',
  'newcomer-priors/test_priors',
  'unified-form/test_form',
  'unified-form/test_heads',
  'unified-form/test_grid',
]) {
  const numerical = spawnSync('python3', [`research/${test}.py`], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
  });
  if (numerical.status !== 0) process.exit(numerical.status || 1);
}
console.log('\nAll tests passed.');
