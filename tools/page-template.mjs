// The HTML around the pages the publishing script writes (tools/build-pages.mjs): what the head says about a page (title, description, address,
// preview, structured data), and the frame of a document page (the pages of the drivers, teams, teammates, findings, and the page for an address
// that does not exist). Everything a page says about itself is absolute, from the address of the site given to the build.
import { SITE_NAME } from '../site/js/page-metadata.js';
import { SITE } from '../site/js/site-identity.js';

export const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

/** A name as part of an address: `Kimi Räikkönen` is `kimi-raikkonen`. */
export const addressName = (name) =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&amp;|&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const SHARE_IMAGE = { path: '/assets/share-image.jpg', width: 1200, height: 630 };

/** Structured data, as a script that browsers do not run (the security policy allows no other inline script). */
const structuredData = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

/**
 * The tags of the head that say what a page is.
 * @param {{base: string, path: string, title: string, description: string, type?: string, data?: object[], index?: boolean}} page
 *   `base` is the address of the site (https://carordriver.com/); `path` the page's own (/drivers/lewis-hamilton); `index: false` asks search
 *   engines to leave the page out (the page for an address that does not exist).
 */
export function headTags({ base, path, title, description, type = 'website', data = [], index = true }) {
  const address = new URL(path, base).href;
  const image = new URL(SHARE_IMAGE.path, base).href;
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    index ? `<link rel="canonical" href="${address}" />` : '<meta name="robots" content="noindex" />',
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    index ? `<meta property="og:url" content="${address}" />` : '',
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="${SHARE_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${SHARE_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${SITE_NAME}: a Formula 1 tyre with the name of the site on its sidewall" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    ...data.map(structuredData),
  ]
    .filter(Boolean)
    .join('\n    ');
}

/** The icons of the site, for browser tabs, bookmarks, home screens and search results. */
export const ICON_TAGS = [
  '<link rel="icon" href="/favicon.ico" sizes="48x48" />',
  '<link rel="icon" href="/assets/icons/icon-192.png" type="image/png" sizes="192x192" />',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
].join('\n    ');

/** The site itself, as search engines read it: its name and address, for the front page. */
export const websiteData = (base) => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: base,
  description: 'Formula 1 ratings that separate the driver from the car.',
});

/** The trail from the front page to a page (`[['Drivers', '/drivers'], ['Lewis Hamilton', '/drivers/lewis-hamilton']]`), as structured data. */
export const breadcrumbData = (base, trail) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [[SITE_NAME, '/'], ...trail].map(([name, path], index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name,
    item: new URL(path, base).href,
  })),
});

const NAVIGATION = [
  ['ratings', '/ratings'],
  ['history', '/history'],
  ['versus', '/head-to-head'],
  ['graph', '/graph'],
  ['prediction', '/prediction'],
  ['insights', '/insights'],
  ['method', '/methodology'],
  ['drivers', '/drivers'],
  ['teams', '/teams'],
];

/**
 * A document page: the head, the name of the site and the links to its pages, then the trail to the page and its panels of brushed metal over the
 * grey drawing of the front page, and the foot.
 * @param {object} page
 * @param {string} page.head            the tags from headTags
 * @param {[string, string][]} page.trail the trail to the page, without the front page
 * @param {string} page.content         the panels of the page (the first holds its <h1>)
 * @param {string[]} [page.scripts]     modules the page runs (a finding draws its chart)
 */
export function documentPage({ head, trail, content, scripts = [] }) {
  const crumbs = trail.length
    ? `<nav class="document-trail" aria-label="Breadcrumb"><ol><li><a href="/">${SITE_NAME}</a></li>${trail
        .map(([name, path], index) =>
          index === trail.length - 1
            ? `<li aria-current="page">${escapeHtml(name)}</li>`
            : `<li><a href="${path}">${escapeHtml(name)}</a></li>`,
        )
        .join('')}</ol></nav>`
    : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    ${head}
    <meta name="theme-color" content="#d90a04" />
    ${ICON_TAGS}
    <link rel="stylesheet" href="/vendor/fonts/fonts.css" />
    <link rel="stylesheet" href="/css/styles.css" />
    <link rel="stylesheet" href="/css/stage.css" />
    <link rel="stylesheet" href="/css/document.css" />
    ${scripts.map((src) => `<script type="module" src="${src}"></script>`).join('\n    ')}
  </head>
  <body class="document-page">
    <header class="document-head">
      <a class="document-brand" href="/"><img src="/assets/icons/tyre-96.webp" alt="" width="34" height="34" /><span><b class="brand-car">Car</b> or <b class="brand-driver">Driver</b></span></a>
      <nav class="document-links" aria-label="Main navigation">${NAVIGATION.map(([name, path]) => `<a href="${path}">${name}</a>`).join('')}</nav>
    </header>
    <main class="document" id="content">
      ${crumbs}
${content.replace(/<table class="document-table">[\s\S]*?<\/table>/g, (table) => `<div class="document-table-scroll">${table}</div>`)}
    </main>
    <footer class="document-foot">
      <p>Every Formula 1 driver and car rated after every Grand Prix since 1994, with the car and the driver separated. Ratings and findings: ${escapeHtml(SITE.dataLicence.name)}.</p>
      <nav aria-label="About this site"><a href="/about">about &amp; privacy</a><a href="/methodology">how the ratings work</a><a href="${SITE.repositoryUrl}" rel="noopener noreferrer">source</a></nav>
    </footer>
  </body>
</html>
`;
}
