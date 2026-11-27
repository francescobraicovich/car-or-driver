// The Node tests never load the browser entry point, so a broken path or a
// missing export in site/ would only surface in a browser. This walks every
// module reachable from site/index.html and checks that each relative import
// resolves to a real file that exports the imported names.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryFile, sitePath } from '../tools/site-addresses.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const problems = [];
const seen = new Set();
const eager = new Set(); // the modules the page loads at start, not those fetched later by import()

const exportsOf = (text) => {
  const names = new Set();
  for (const m of text.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (name) names.add(name);
    }
  }
  return names;
};

async function visit(file, isEager = true) {
  if (isEager ? eager.has(file) : seen.has(file)) return;
  seen.add(file);
  if (isEager) eager.add(file);
  const text = await readFile(file, 'utf8');
  const where = relative(ROOT, file);
  const specs = [];
  for (const m of text.matchAll(/import\s+(?:([\s\S]*?)\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g)) specs.push([m[1], m[2]]);
  const lazy = new Set();
  for (const m of text.matchAll(/import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
    specs.push([null, m[1]]);
    lazy.add(m[1]);
  }
  for (const m of text.matchAll(/new URL\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*,\s*import\.meta\.url/g)) specs.push([null, m[1]]);
  for (const [clause, spec] of specs) {
    const target = resolve(dirname(file), spec);
    if (target.endsWith('/state-space/forecast-heads.js'))
      problems.push(`${where}: forecast definitions must come from the saved model, not a bundled learner`);
    if (!existsSync(target)) {
      problems.push(`${where}: cannot resolve ${spec}`);
      continue;
    }
    if (clause && target.endsWith('.js')) {
      const targetText = await readFile(target, 'utf8');
      const available = exportsOf(targetText);
      const named = clause.match(/\{([\s\S]*)\}/)?.[1] ?? '';
      for (const part of named.split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0];
        if (name && !available.has(name)) problems.push(`${where}: ${spec} does not export ${name}`);
      }
    }
    if (target.endsWith('.js')) await visit(target, isEager && !lazy.has(spec));
  }
}

const html = await readFile(`${ROOT}site/index.html`, 'utf8');
for (const m of html.matchAll(/<(\w+)([^>]*?)(?:src|href)="(\/[^"#/][^"#]*)"/g)) {
  if (m[1] === 'a') continue; // a link to follow, not a file the page loads
  const target = repositoryFile(m[3], ROOT);
  const classicScript = m[1] === 'script' && !/type="module"/.test(m[0]); // a plain script is not a module and is not preloaded as one
  if (!existsSync(target)) problems.push(`site/index.html: cannot resolve ${m[3]}`);
  else if (m[3].endsWith('.js') && !classicScript) await visit(target);
}

// Every module the page loads at start is announced in the HTML, so the browser fetches them together instead of discovering each import after
// the one that imports it (on a slow connection every level of that chain costs a round trip).
for (const file of eager) {
  const path = sitePath(file, ROOT);
  if (file.endsWith('.js') && !html.includes(`<link rel="modulepreload" href="${path}" />`))
    problems.push(`site/index.html: add <link rel="modulepreload" href="${path}" />`);
}

// and nothing else, so the list cannot go stale
const announced = new Set([...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => repositoryFile(m[1], ROOT)));
for (const file of announced)
  if (!eager.has(file)) problems.push(`site/index.html: remove the modulepreload of ${sitePath(file, ROOT)}, which is not loaded at start`);

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`FAIL site imports: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`PASS site imports: ${seen.size} modules resolve and export what they import`);
