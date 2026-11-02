// Verify that deployment follows static imports, re-exports and lazy imports, and rejects missing dependencies.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { browserModules, scriptEntries } from '../tools/build-pages.mjs';

assert.deepEqual(
  scriptEntries(`<script src="./js/boot.js"></script><script type="module" src='js/app.js'></script><script>inline()</script>`),
  ['site/js/boot.js', 'site/js/app.js'],
);

const root = await mkdtemp(join(tmpdir(), 'site-modules-'));
try {
  await mkdir(join(root, 'core'));
  await writeFile(join(root, 'entry.js'), "import main, { value } from './static.js';\nimport('./lazy.js');\n");
  await writeFile(
    join(root, 'static.js'),
    "export { value } from './core/value.js';\nexport * from './core/shared.js';\nexport default 1;\n",
  );
  await writeFile(join(root, 'lazy.js'), "import { value } from './core/lazy-value.js';\n");
  await writeFile(join(root, 'core/value.js'), "import '../entry.js';\nexport const value = 1;\n");
  await writeFile(join(root, 'core/shared.js'), 'export const shared = 1;\n');
  await writeFile(join(root, 'core/lazy-value.js'), 'export const value = 2;\n');
  const modules = await browserModules(root, ['entry.js']);
  for (const name of ['entry.js', 'static.js', 'lazy.js', 'core/value.js', 'core/shared.js', 'core/lazy-value.js'])
    assert.ok(modules.has(resolve(root, name)), `${name} is included`);
  await rm(join(root, 'core/lazy-value.js'));
  await assert.rejects(browserModules(root, ['entry.js']), { code: 'ENOENT' });
} finally {
  await rm(root, { recursive: true, force: true });
}
console.log('PASS deployment module dependencies');
