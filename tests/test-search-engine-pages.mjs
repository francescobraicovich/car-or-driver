// The pages written for search engines (tools/build-pages.mjs): every address in the site map has a page that names itself as that address, with
// a title and description of its own; every link between the pages leads somewhere; the drivers' and teams' extremes are the Insights' own; the
// generated words name drivers, never a pronoun; robots.txt, the 404 page and the redirects from /site/ are published.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRatings } from '../tools/driver-and-team-pages.mjs';
import { INSIGHTS_DATA } from '../site/js/insights-data.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = 'https://example.test/';
const DIST = join(ROOT, 'dist');

async function walk(folder) {
  const found = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path)));
    else found.push(path);
  }
  return found;
}

/** The file Cloudflare Pages serves at an address path: /ratings is ratings.html, a file is itself. */
const fileAt = (path) =>
  [join(DIST, path), join(DIST, path === '/' ? 'index.html' : `${path}.html`)].find((file) => existsSync(file) && statSync(file).isFile());

const run = spawnSync(process.execPath, ['tools/build-pages.mjs', BASE], { cwd: ROOT, encoding: 'utf8' });
assert.equal(run.status, 0, run.stderr);
try {
  const sitemap = await readFile(join(DIST, 'sitemap.xml'), 'utf8');
  const addresses = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.ok(addresses.length > 400, `the site map lists every page (${addresses.length})`);
  assert.equal(new Set(addresses).size, addresses.length, 'the site map lists each page once');
  const titles = new Map();
  const descriptions = new Map();
  for (const address of addresses) {
    assert.ok(address.startsWith(BASE), `${address} is on the site`);
    const path = `/${address.slice(BASE.length)}`;
    const file = fileAt(path);
    assert.ok(file, `${address} has a page`);
    const html = await readFile(file, 'utf8');
    const canonical = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(canonical, [address], `${path} names itself as its address, once`);
    assert.ok(html.includes(`<meta property="og:url" content="${address}"`), `${path} gives its address to link previews`);
    assert.ok(html.includes(`<meta property="og:image" content="${BASE}assets/share-image.jpg"`), `${path} has the share image`);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(title && description, `${path} has a title and a description`);
    assert.ok(!titles.has(title), `${path} and ${titles.get(title)} share the title ${title}`);
    assert.ok(!descriptions.has(description), `${path} and ${descriptions.get(description)} share a description`);
    titles.set(title, path);
    descriptions.set(description, path);
    assert.equal((html.match(/<h1(?![^>]*stage-title)[\s>]/g) || []).length, 1, `${path} has one main heading of its own`); // (besides the stage's title, which the site shows)
    for (const data of html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)) JSON.parse(data[1]);
  }
  assert.equal(titles.get('Who is the best Car or Driver in F1?'), '/', 'the front page has the title of the site');

  // every link from one page to another, or to a file, leads somewhere
  const pages = (await walk(DIST)).filter((file) => file.endsWith('.html'));
  const broken = new Set();
  for (const file of pages) {
    const html = await readFile(file, 'utf8');
    for (const [, href] of html.matchAll(/\b(?:href|src)="(\/[^"#]*)"/g)) {
      const path = href.split('?')[0].replace(/&amp;.*$/, '');
      if (!fileAt(path)) broken.add(`${relative(DIST, file)} → ${href}`);
    }
  }
  assert.deepEqual([...broken].slice(0, 10), [], 'every link between the pages leads to a page or a file');

  // the generated words about drivers use their names
  for (const file of pages.filter((name) => /\/(drivers|teams|teammates)\//.test(name))) {
    const text = (await readFile(file, 'utf8')).replace(/<[^>]+>/g, ' ');
    assert.ok(!/\b(he|him|his|she|her|hers)\b/i.test(text), `${relative(DIST, file)} refers to a driver by a pronoun`);
  }

  // the page for an address that does not exist, and the files search engines read first
  const notFound = await readFile(join(DIST, '404.html'), 'utf8');
  assert.ok(
    notFound.includes('<meta name="robots" content="noindex" />') && !notFound.includes('rel="canonical"'),
    'the 404 page is left out',
  );
  assert.equal(await readFile(join(DIST, 'robots.txt'), 'utf8'), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}sitemap.xml\n`);
  assert.equal(await readFile(join(DIST, '_redirects'), 'utf8'), '/site / 301\n/site/* /:splat 301\n');
  assert.ok(
    (await readFile(join(DIST, '_headers'), 'utf8')).includes('https://:project.pages.dev/*\n  X-Robots-Tag: noindex'),
    'the copy at pages.dev is left out',
  );
  // the text of the page for readers without scripts, which the site removes when it starts
  const ratingsPage = await readFile(fileAt('/ratings'), 'utf8');
  assert.ok(
    /<article class="page-text" id="pageText"><h1>F1 driver and car ratings<\/h1>/.test(ratingsPage),
    'the Ratings page has its text',
  );
  assert.ok(ratingsPage.includes('<a href="/drivers/max-verstappen">Max Verstappen</a>'), 'the Ratings page links to the drivers');
} finally {
  await rm(DIST, { recursive: true, force: true });
}

// the drivers' and the cars' highest and lowest ratings are those of the Insights (the same displayed ratings, the same 20-start rule)
const ratings = await readRatings(ROOT);
for (const [list, entities, field] of [
  ['driverHigh', ratings.drivers, 'peak'],
  ['driverLow', ratings.drivers, 'lowest'],
  ['carHigh', ratings.teams, 'peak'],
  ['carLow', ratings.teams, 'lowest'],
])
  for (const entry of INSIGHTS_DATA.ratingExtremes[list]) {
    const found = [...entities.values()].find((entity) => entity.name === entry.name)?.[field];
    assert.ok(
      found && Math.round(found.rating * 10) / 10 === entry.rating && found.year === entry.year && found.grandPrix === entry.grandPrix,
      `${list}: ${entry.name} ${entry.rating} after the ${entry.year} ${entry.grandPrix}`,
    );
  }
console.log(
  `PASS search engine pages: every page in the site map names itself, has its own title and description, and links only to pages that exist`,
);
