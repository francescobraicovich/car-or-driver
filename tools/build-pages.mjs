// Assemble the deployable folder (dist/) for static hosting.
//
// The site imports modules from ../packages/core and fetches the built ratings from ../data. The browser-reachable
// core modules and the site data are copied alongside the site; research code, logs, fixtures, the source CSVs and the internal documents are left out. A root index.html
// redirects to site/, and the canonical/og:url tags are filled in from the URL
// given on the command line (the Pages URL).
//
//   node tools/build-pages.mjs [https://user.github.io/repo/]
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDeployHeaders } from './deploy-headers.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// The page may load both classic scripts and module scripts; inline scripts have no file to follow.
export function scriptEntries(html) {
  return [...html.matchAll(/<script\b[^>]*>/gi)]
    .map(([tag]) => tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1])
    .filter((source) => source && !/^(?:[a-z][\w+.-]*:|\/\/)/i.test(source))
    .map((source) => join('site', source));
}

// Follow static imports, re-exports and literal dynamic imports, including the lazy page modules.
export async function browserModules(root, entries) {
  const modules = new Set();
  async function visit(file) {
    const path = resolve(file);
    if (modules.has(path)) return;
    modules.add(path);
    const source = await readFile(path, 'utf8');
    const imports = /(?:\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?|\bimport\s*\(\s*)['"](\.[^'"]+)['"]/g;
    for (const match of source.matchAll(imports)) await visit(resolve(dirname(path), match[1]));
  }
  for (const entry of entries) await visit(resolve(root, entry));
  return modules;
}

async function buildPages() {
  const DIST = join(ROOT, 'dist');
  const base = (process.argv[2] || '').replace(/\/?$/, '/');

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await cp(join(ROOT, 'site'), join(DIST, 'site'), { recursive: true });
  const entries = scriptEntries(await readFile(join(ROOT, 'site/index.html'), 'utf8'));
  const modules = await browserModules(ROOT, entries);
  for (const path of modules) {
    const name = relative(ROOT, path);
    if (!name.startsWith('packages/core/')) continue;
    const destination = join(DIST, name);
    await mkdir(dirname(destination), { recursive: true });
    await cp(path, destination);
  }
  await mkdir(join(DIST, 'data'));
  for (const name of ['model-latest.json', 'model.json', 'teammate-graph.json'])
    await cp(join(ROOT, 'data', name), join(DIST, 'data', name)); // the CSVs the model was computed from are not published
  await cp(join(ROOT, 'data/race-laps'), join(DIST, 'data/race-laps'), { recursive: true }); // the laps of each season, for the racing dots
  await writeFile(
    join(DIST, 'index.html'),
    '<!doctype html><meta charset="utf-8"><title>Car or Driver</title><meta http-equiv="refresh" content="0; url=./site/"><a href="./site/">Car or Driver</a>\n',
  );

  // Cloudflare Pages applies this file to every response. It is written from the parsed rules, without the comments, so the published file is exactly the policy.
  const rules = await readDeployHeaders();
  await writeFile(
    join(DIST, '_headers'),
    `${Object.entries(rules)
      .map(
        ([path, headers]) =>
          `${path}\n${Object.entries(headers)
            .map(([name, value]) => `  ${name}: ${value}`)
            .join('\n')}`,
      )
      .join('\n\n')}\n`,
  );
  const page = join(DIST, 'site/index.html');
  const tags = base === '/' ? '' : `<link rel="canonical" href="${base}">\n<meta property="og:url" content="${base}">`;
  const html = await readFile(page, 'utf8');
  const marker = /<!-- CANONICAL_TAGS:[^>]*-->/;
  if (!marker.test(html)) throw new Error('CANONICAL_TAGS marker missing from site/index.html');
  await writeFile(page, html.replace(marker, tags));
  console.log(`dist/ ready${tags ? `, canonical ${base}` : ' (no canonical URL given)'}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildPages();
