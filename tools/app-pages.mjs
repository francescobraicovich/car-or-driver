// The pages of the site itself (/ratings, /methodology/full, …: the front page with something over it, site/js/address.js), one file for each
// address, written by the publishing script (tools/build-pages.mjs). Each is site/index.html with its own head (title, description, address,
// structured data) and, for readers and search engines without scripts, its own text: the site replaces that text when it starts (app.js).
import { ROUTES } from '../site/js/address.js';
import { PAGE_METADATA, SITE_NAME } from '../site/js/page-metadata.js';
import { CONTENT_HTML } from '../site/js/methodology-content.js';
import { SIMPLE_CONTENT_HTML } from '../site/js/methodology-simple-content.js';
import { legalDocumentHtml } from '../site/js/legal-view.js';
import { SITE } from '../site/js/site-identity.js';
import { currentTable } from './driver-and-team-pages.mjs';
import { insightList } from './insight-pages.mjs';
import { breadcrumbData, escapeHtml, headTags, websiteData } from './page-template.mjs';

const HEAD = /<!-- PAGE_HEAD:[\s\S]*?<!-- \/PAGE_HEAD -->/;
const TEXT = /<!-- PAGE_TEXT:[^>]*-->/;

const SECTIONS = [
  ['Ratings', '/ratings'],
  ['History', '/history'],
  ['Head to head', '/head-to-head'],
  ['Race prediction', '/prediction'],
  ['Teammate network', '/graph'],
  ['Insights', '/insights'],
  ['How the ratings work', '/methodology'],
  ['Drivers', '/drivers'],
  ['Teams', '/teams'],
  ['Teammates compared', '/teammates'],
  ['About and privacy', '/about'],
];
const sectionLinks = `<nav aria-label="The pages of ${SITE_NAME}"><ul>${SECTIONS.map(([name, path]) => `<li><a href="${path}">${name}</a></li>`).join('')}</ul></nav>`;
const insightLinks = () =>
  `<ul>${insightList()
    .map(({ page, path, answer }) => `<li><a href="${path}">${escapeHtml(page.heading)}</a> ${escapeHtml(answer)}</li>`)
    .join('')}</ul>`;

/** The text of each page, for readers without scripts. */
function pageText(route, ratings) {
  const meta = PAGE_METADATA[route];
  const opening = `<h1>${escapeHtml(meta.heading ?? 'Who is the best Car or Driver in F1?')}</h1><p>${escapeHtml(meta.description)}</p>`;
  const recentPairs = [...ratings.pairs.values()]
    .filter((pair) => pair.races.at(-1).year === ratings.current.weekend.year && pair.races.length >= 5)
    .map((pair) => `<li><a href="${pair.path}">${escapeHtml(pair.drivers[0].name)} vs ${escapeHtml(pair.drivers[1].name)}</a></li>`)
    .join('');
  const body = {
    '/': `${currentTable(ratings, 'drivers')}<h2>Insights</h2>${insightLinks()}`,
    '/ratings': `${currentTable(ratings, 'drivers')}${currentTable(ratings, 'cars')}<p>Every driver: <a href="/drivers">the drivers since 1994</a>. Every car: <a href="/teams">the teams since 1994</a>.</p>`,
    '/history': `<h2>The rating histories of the current drivers</h2><ul>${ratings.current.drivers.map((row) => `<li><a href="${row.driver.path}">${escapeHtml(row.driver.name)}</a></li>`).join('')}</ul>`,
    '/head-to-head': `<h2>The teammates of this season</h2><ul>${recentPairs}</ul><p><a href="/teammates">Every pair of teammates since 1994</a>.</p>`,
    '/prediction': `<p>The prediction is computed in the page from the current ratings:</p>${currentTable(ratings, 'drivers')}`,
    '/graph': `<p>The pairs of teammates, compared one by one: <a href="/teammates">every pair since 1994</a>.</p>`,
    '/insights': insightLinks(),
    '/methodology': `<ul><li><a href="/methodology/simple">How the ratings work, simply explained</a></li><li><a href="/methodology/full">The full methodology</a></li></ul>`,
    '/methodology/simple': SIMPLE_CONTENT_HTML,
    '/methodology/full': CONTENT_HTML,
    '/about': legalDocumentHtml(),
  }[route];
  return `<article class="page-text" id="pageText">${opening}${body}${sectionLinks}</article>`;
}

/** What search engines read about the site and its ratings, on the front page and the Ratings page. */
const siteData = (base, ratings) => [
  websiteData(base),
  {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: base,
    applicationCategory: 'SportsApplication',
    operatingSystem: 'Web',
    isAccessibleForFree: true,
    description: 'Ratings that separate Formula 1 driver pace from car speed, with uncertainty, since 1994.',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${SITE_NAME}: Formula 1 driver and car ratings`,
    description:
      'Ratings of every Formula 1 driver and car after every Grand Prix since 1994, from a model that separates the driver from the car, with standard deviations.',
    url: new URL('/ratings', base).href,
    license: SITE.dataLicence.url,
    creator: { '@type': 'Person', name: SITE.operatorName },
    temporalCoverage: `${ratings.firstDate}/${ratings.lastRace.date}`,
    dateModified: ratings.lastRace.date,
    isAccessibleForFree: true,
    keywords: ['Formula 1', 'F1', 'driver ratings', 'car ratings', 'Grand Prix'],
    distribution: [
      { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: new URL('/data/retrospective.json', base).href },
      { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: new URL('/data/model.json', base).href },
    ],
  },
];

/** The pages of the site, each from the template (site/index.html), as [{path, html}]. */
export function appPages({ template, base, ratings }) {
  if (!HEAD.test(template) || !TEXT.test(template)) throw Error('site/index.html has lost its PAGE_HEAD or PAGE_TEXT marker');
  return ROUTES.map((route) => {
    const meta = PAGE_METADATA[route];
    const trail = route === '/' ? [] : [[meta.heading, route]];
    const data = [
      ...(route === '/' || route === '/ratings' ? siteData(base, ratings) : []),
      ...(trail.length ? [breadcrumbData(base, trail)] : []),
    ];
    const head = headTags({ base, path: route, title: meta.title, description: meta.description, data });
    return { path: route, html: template.replace(HEAD, () => head).replace(TEXT, () => pageText(route, ratings)) };
  });
}
