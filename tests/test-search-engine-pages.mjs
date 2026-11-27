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
  for (const file of pages.filter((name) => /\/(drivers|teams|teammates|compare|seasons)\//.test(name))) {
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
  assert.equal(await readFile(join(DIST, '_redirects'), 'utf8'), '/site / 301\n/site/* /:splat 301\n/compare /head-to-head 301\n');
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
  // a driver's page: the way to History beside the rating as well as at the top
  const hamilton = await readFile(fileAt('/drivers/lewis-hamilton'), 'utf8');
  assert.equal((hamilton.match(/>Compare in history</g) || []).length, 2, 'History is offered at the top and beside the rating chart');
  // the record against each teammate, as the Graph counts it (Verstappen against Pérez: 81–6 in qualifying, 75–7 in races)
  const verstappen = await readFile(fileAt('/drivers/max-verstappen'), 'utf8');
  assert.ok(
    /Sergio Pérez<\/a><span class="versus-meta">[^<]*<\/span><span class="versus-record">Qualifying <b class="ahead">81–6<\/b> · Races <b class="ahead">75–7<\/b>/.test(
      verstappen,
    ),
    'a driver page gives the qualifying and race record against each teammate',
  );
  const duel = await readFile(fileAt('/teammates/lewis-hamilton-vs-nico-rosberg'), 'utf8');
  assert.ok(duel.includes('>42–34</b>') && duel.includes('>44–29</b>'), 'a teammates page gives their qualifying and race record');
  assert.ok(
    /<nav class="document-links[^"]*"[^>]*>.*<a href="\/drivers">drivers<\/a><a href="\/teams">cars<\/a>/.test(hamilton),
    'the menu leads to the drivers and the cars',
  );
  // the pages of the questions on the front page: two drivers who were not teammates (for long), and each season that is over
  const figure = (html, tone) => {
    const value = html.match(
      new RegExp(`profile-figure ${tone}"><span class="figure-label">[^<]*</span><span class="figure-value">(\\d+)<`),
    )?.[1];
    assert.ok(value, `the page has its ${tone}`);
    return value;
  };
  assert.ok(
    ['head-to-head', 'compare/lewis-hamilton-vs-max-verstappen', 'seasons', 'seasons/2021'].every((path) =>
      addresses.includes(`${BASE}${path}`),
    ),
    'the site map lists the head to head, the comparisons and the seasons',
  );
  // the page of two drivers is their head to head: the answer first (who would finish ahead in the same car, at their best), worked out when the page
  // is written, then the figures; its script has the page's data, and no page shows the trail of pages that led to it
  const answer = (html) =>
    html
      .match(/<b data-chance="0">(\d+)%<\/b>.*<b data-chance="1">(\d+)%<\/b>/)
      ?.slice(1)
      .map(Number);
  const compared = await readFile(fileAt('/compare/lewis-hamilton-vs-max-verstappen'), 'utf8');
  assert.ok(
    compared.includes('<title>Lewis Hamilton vs Max Verstappen: who is the better F1 driver?'),
    'a comparison is named as the question',
  );
  assert.ok(
    answer(compared) &&
      answer(compared)[0] + answer(compared)[1] === 100 &&
      compared.indexOf('data-chance') < compared.indexOf('Who is better'),
    'a comparison opens with the head to head of the two, in the same car at their best',
  );
  const data = JSON.parse(compared.match(/<script type="application\/json" id="pairData">([^<]*)<\/script>/)[1]);
  assert.ok(
    data.drivers.length === 2 &&
      ['best', 'latest'].every((moment) => data.forecasts[moment].same.p > 0 && data.forecasts[moment].own.p > 0) &&
      data.forecasts.next.p > 0,
    'the page carries the forecasts it can switch between',
  );
  assert.ok(!/document-trail|aria-label="Breadcrumb"/.test(compared + hamilton), 'no page shows a trail of pages');
  assert.equal(figure(compared, 'figure-first'), figure(hamilton, 'figure-peak'), 'a comparison gives the peak of the driver page');
  assert.equal(figure(compared, 'figure-second'), figure(verstappen, 'figure-peak'), 'a comparison gives the peak of each driver page');
  assert.ok(
    hamilton.includes('<a href="/compare/lewis-hamilton-vs-max-verstappen">'),
    'a driver page leads to the comparisons of the driver',
  );
  const teammates = await readFile(fileAt('/teammates/lewis-hamilton-vs-nico-rosberg'), 'utf8');
  assert.ok(answer(teammates) && /Teammates at Mercedes/.test(teammates), 'two teammates have the same page, with their record together');
  const headToHead = await readFile(fileAt('/head-to-head'), 'utf8');
  assert.ok(
    /<form class="pair-pick" action="\/head-to-head" method="get">/.test(headToHead) &&
      (headToHead.match(/<option value=/g) || []).length > 300,
    'the head to head offers any two drivers',
  );
  const teammatePages = new Set((await readdir(join(DIST, 'teammates'))).filter((name) => name.endsWith('.html')));
  const comparisonPages = (await readdir(join(DIST, 'compare'))).filter((name) => name.endsWith('.html'));
  assert.ok(comparisonPages.length > 100, `many comparisons (${comparisonPages.length})`);
  assert.deepEqual(
    comparisonPages.filter((name) => teammatePages.has(name)),
    [],
    'two drivers with a teammates page are compared there, not twice',
  );
  const seasonPages = (await readdir(join(DIST, 'seasons'))).filter((name) => name.endsWith('.html')).sort();
  assert.equal(seasonPages[0], '1994.html', 'the seasons start with the ratings');
  assert.equal(seasonPages.length, Number(seasonPages.at(-1).slice(0, 4)) - 1993, 'every season has a page');
  const season = await readFile(fileAt('/seasons/2021'), 'utf8');
  assert.ok(season.includes('<h1 class="list-title">Who was the best F1 driver in 2021?</h1>'), 'a season is named as the question');
  const [, leader] =
    season.match(
      /<tbody><tr><td class="number place">1<\/td><th scope="row"><a href="[^"]+">[^<]+<\/a><\/th><td>.*?<\/td><td class="number rating">(\d+)</,
    ) ?? [];
  assert.equal(figure(season, 'figure-second'), leader, 'the best driver of a season heads its table');
  assert.ok(hamilton.includes('<th scope="row"><a href="/seasons/2021">2021</a></th>'), 'a driver page leads to the seasons of the driver');
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
