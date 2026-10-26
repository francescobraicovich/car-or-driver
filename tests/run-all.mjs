// Runs every test in sequence; fails fast with the failing test's output.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TESTS = [
  'golden.mjs',
  'test-fast-paths.mjs',
  'test-elo.mjs',
  'test-charts.mjs',
  'test-chart-math.mjs',
  'test-dom-ids.mjs',
  'test-head-to-head-breakdown.mjs',
  'test-form-shift.mjs',
  'test-scenario.mjs',
  'test-rookie-prior.mjs',
  'test-lineage.mjs',
  'test-forecast-parity.mjs',
  'test-state-space.mjs',
  'test-hybrid.mjs',
  'test-state-space-forecast.mjs',
  'test-eval.mjs',
  'test-synthetic-v2.mjs',
  'test-data-manifest.mjs',
  'test-model-file.mjs',
  'test-race-laps.mjs',
  'test-compliance.mjs',
  'test-stage.mjs',
  'test-insights.mjs',
  'test-layering.mjs',
  'test-teammate-graph.mjs',
  'test-site-imports.mjs',
];

for (const t of TESTS) {
  console.log(`\n# ${t}`);
  const r = spawnSync(process.execPath, [`tests/${t}`], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\nFAILED: ${t}`);
    process.exit(r.status || 1);
  }
}
console.log('\nAll tests passed.');
