// Architectural guard: the model (packages/core) must stay free of the UI.
//
// Core code has to run unchanged in Node, in a Web Worker and in the browser, so
// it may not import anything from site/ or research/, and may not touch the DOM.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CORE = join(ROOT, 'packages/core');
const DOM = /\b(document|window|localStorage|indexedDB|HTMLElement|navigator)\b/;

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.m?js$/.test(e.name)) yield p;
  }
}

const problems = [];
for await (const file of walk(CORE)) {
  if (file.endsWith('/elo-forecast-heads.js')) continue; // generated data, 950 KB
  const text = await readFile(file, 'utf8');
  for (const [, spec] of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    if (!spec.startsWith('.')) continue;
    const target = resolve(dirname(file), spec);
    if (!target.startsWith(CORE)) problems.push(`${relative(ROOT, file)} imports outside core: ${spec}`);
  }
  const code = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const m = code.match(DOM);
  if (m) problems.push(`${relative(ROOT, file)} references browser global "${m[1]}"`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`FAIL layering: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('PASS packages/core is free of site/ imports and browser globals');
