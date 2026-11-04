// The original production forecast is an immutable research reference.
import { execFileSync } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const REFERENCE_COMMIT = '92634ea6d8116cfdd7601df24f8fbeeeb6b3b57c';

export async function referenceHeads() {
  const root = new URL('../../', import.meta.url);
  const directory = new URL('tmp/simplification/', root);
  const target = new URL(`reference-heads-${REFERENCE_COMMIT}.mjs`, directory);
  const temporary = new URL(`reference-heads-${REFERENCE_COMMIT}.${process.pid}.tmp`, directory);
  await mkdir(directory, { recursive: true });
  const source = execFileSync('git', ['show', `${REFERENCE_COMMIT}:packages/core/src/state-space/forecast-heads.js`], { cwd: fileURLToPath(root) });
  await writeFile(temporary, source);
  await rename(temporary, target);
  return (await import(target.href)).STATE_SPACE_HEADS;
}
