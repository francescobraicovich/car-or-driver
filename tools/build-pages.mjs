// Assemble the deployable folder (dist/) for static hosting.
//
// The site (site/) is published at the root of the address space; it imports modules from /packages/core and fetches the built ratings from /data
// (tools/site-addresses.mjs). The browser-reachable core modules and the site data are copied alongside the site; research code, logs, fixtures,
// the source CSVs and the internal documents are left out. Addresses under /site/, where the site used to be, redirect to the root. The canonical
// and og:url tags are filled in from the URL given on the command line (the address of the site; by default, SITE.address).
// Every page has a file of its own (app-pages.mjs, insight-pages.mjs, driver-and-team-pages.mjs), with a site map, robots.txt and a 404 page.
//
//   node tools/build-pages.mjs [https://carordriver.com/]
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDeployHeaders } from './deploy-headers.mjs';
import { appPages } from './app-pages.mjs';
import { driverAndTeamPages, readRatings } from './driver-and-team-pages.mjs';
import { insightIndexPage, insightPages } from './insight-pages.mjs';
import { documentPage, headTags } from './page-template.mjs';
import { pageTitle } from '../site/js/page-metadata.js';
import { SITE } from '../site/js/site-identity.js';

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
  const base = new URL(process.argv[2] || SITE.address).href.replace(/\/?$/, '/');

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  const referenceFiles = [
    'assets/f1-driver',
    'assets/f1-mercedes-car',
    'assets/models',
    'js/stage-model-assets.js',
    'js/stage-model-motion.js',
    'js/stage-model-view.js',
  ].map((name) => join(ROOT, 'site', name));
  await cp(join(ROOT, 'site'), DIST, {
    recursive: true,
    // Keep the archived 3D experiment available locally, outside the restored website.
    filter: (path) => !referenceFiles.includes(path),
  });
  const entries = [...scriptEntries(await readFile(join(ROOT, 'site/index.html'), 'utf8')), 'site/js/insight-page.js']; // (the page of a finding runs its own module)
  const modules = await browserModules(ROOT, entries);
  for (const path of modules) {
    const name = relative(ROOT, path);
    if (!name.startsWith('packages/core/')) continue;
    const destination = join(DIST, name);
    await mkdir(dirname(destination), { recursive: true });
    await cp(path, destination);
  }
  await mkdir(join(DIST, 'data'));
  for (const name of [
    'model-latest.json',
    'model.json',
    'retrospective-latest.json',
    'retrospective.json',
    'teammate-graph.json',
    'rating-reference.json',
  ])
    await cp(join(ROOT, 'data', name), join(DIST, 'data', name)); // the CSVs the model was computed from are not published
  await cp(join(ROOT, 'data/race-laps'), join(DIST, 'data/race-laps'), { recursive: true }); // the laps of each season, for the racing dots
  // Cloudflare Pages reads _redirects: the site used to be under /site/, and links to it keep working.
  await writeFile(join(DIST, '_redirects'), '/site / 301\n/site/* /:splat 301\n');

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

  // One file for each page, at the address Cloudflare Pages serves it from: /ratings is ratings.html, /drivers/lewis-hamilton is
  // drivers/lewis-hamilton.html, the front page is index.html.
  const ratings = await readRatings(ROOT);
  const template = await readFile(join(ROOT, 'site/index.html'), 'utf8');
  const pages = [
    ...appPages({ template, base, ratings }),
    insightIndexPage({ base }),
    ...insightPages({ base, ratings }),
    ...driverAndTeamPages(ratings, base),
  ];
  const paths = new Set();
  for (const { path, html } of pages) {
    if (paths.has(path)) throw Error(`two pages at ${path}`);
    paths.add(path);
    const file = join(DIST, path === '/' ? 'index.html' : `${path.slice(1)}.html`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html);
  }
  await writeFile(join(DIST, '404.html'), notFoundPage(base));
  await writeFile(
    join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...paths]
      .map((path) => `  <url><loc>${new URL(path, base).href}</loc><lastmod>${ratings.lastRace.date}</lastmod></url>`)
      .join('\n')}\n</urlset>\n`,
  );
  await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', base).href}\n`);
  console.log(`dist/ ready: ${pages.length} pages at ${base}`);
}

/** The page for an address that does not exist (Cloudflare Pages serves 404.html with the status 404), which search engines leave out. */
function notFoundPage(base) {
  return documentPage({
    head: headTags({
      base,
      path: '/404',
      title: pageTitle('Page not found'),
      description: 'There is no page at this address.',
      index: false,
    }),
    trail: [],
    content: `      <section class="document-panel profile">
        <h1 class="list-title">Page not found</h1>
        <p class="profile-meta">There is no page at this address. It may have moved: the site now has an address for each page.</p>
        <div class="profile-actions"><a class="document-button primary" href="/">The front page</a><a class="document-button" href="/ratings">The ratings</a><a class="document-button" href="/insights">The insights</a><a class="document-button" href="/drivers">Every driver</a></div>
      </section>`,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildPages();
