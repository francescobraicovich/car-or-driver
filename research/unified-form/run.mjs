import { spawnSync } from 'node:child_process';

function execute(program, arguments_) {
  const result = spawnSync(program, arguments_, {
    stdio: 'inherit',
    env: { ...process.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' },
  });
  if (result.status !== 0) throw Error(`${program} ${arguments_.join(' ')} failed: ${result.error?.message ?? result.status}`);
}

execute('node', ['research/unified-form/export.mjs']);
for (const name of [
  'test_form',
  'test_heads',
  'test_grid',
  'fit',
  'evaluate',
  'heads',
  'check_heads',
  'check_grid',
  'weather',
  'validate_grid',
  'simulation',
  'report',
]) {
  execute('python3', [`research/unified-form/${name}.py`]);
}
