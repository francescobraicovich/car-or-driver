// Moving code or documentation must not leave broken imports, commands or local links.
import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const problems = [];

async function* files(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

async function requirePath(path, context) {
  try {
    await access(path);
  } catch {
    problems.push(`${context}: missing ${path.slice(root.length)}`);
  }
}

for (const directory of ['site/js', 'packages', 'tools', 'tests', 'research']) {
  for await (const file of files(join(root, directory))) {
    if (!/\.m?js$/.test(file)) continue;
    const source = await readFile(file, 'utf8');
    const imports = /^\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm;
    for (const match of source.matchAll(imports)) await requirePath(resolve(dirname(file), match[1]), file.slice(root.length));
  }
}

const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
for (const [name, command] of Object.entries(manifest.scripts)) {
  for (const match of command.matchAll(/(?:node|python3)\s+([\w./-]+\.(?:mjs|js|py))/g))
    await requirePath(resolve(root, match[1]), `npm run ${name}`);
}

for await (const file of files(join(root, '.github/workflows'))) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/\bnode\s+([\w./-]+\.mjs)/g)) await requirePath(resolve(root, match[1]), file.slice(root.length));
  for (const match of source.matchAll(/npm run ([\w:-]+)/g))
    assert.ok(match[1] in manifest.scripts, `${file.slice(root.length)}: unknown npm command ${match[1]}`);
}

const documents = [join(root, 'README.md'), join(root, 'CLAUDE.md')];
for (const directory of ['docs', 'research', 'packages', 'data']) {
  for await (const file of files(join(root, directory))) if (file.endsWith('.md')) documents.push(file);
}
for (const file of documents) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(?:[a-z]+:|\/\/)/i.test(target)) continue;
    await requirePath(resolve(dirname(file), decodeURIComponent(target)), file.slice(root.length));
  }
}

assert.deepEqual(problems, [], problems.join('\n'));
console.log('PASS repository structure: module imports, npm commands and documentation links resolve');
