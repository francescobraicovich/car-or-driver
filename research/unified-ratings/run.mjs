import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';

const execute = (program, args) => {
  const result = spawnSync(program, args, {
    stdio: 'inherit',
    env: { ...process.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
  });
  if (result.status !== 0) throw Error(`${program} ${args.join(' ')} failed: ${result.error?.message ?? result.status}`);
};
try {
  await access('tmp/graph-evidence/baseline-history.json');
} catch {
  execute('node', ['research/graph-evidence/export.mjs']);
  execute('python3', [
    'research/graph-evidence/model.py',
    'tmp/graph-evidence/input.json',
    'research/graph-evidence/baseline.json',
    'tmp/graph-evidence/baseline-history.json',
  ]);
}
execute('node', ['research/unified-ratings/export.mjs']);
for (const script of ['fit.py', 'evaluate.py', 'simulation.py', 'report.py']) execute('python3', [`research/unified-ratings/${script}`]);
execute('python3', ['research/unified-ratings/forecast.py', 'build']);
execute('python3', ['research/unified-ratings/test_model.py']);
execute('node', ['tests/test-unified-ratings.mjs']);
