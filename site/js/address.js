// The address of a page of the site: its path (/ratings) and its options (?v=1&…). Every page is the front page with something over it
// (stage-pages.js), so moving between them changes the address without loading a new document. Links from before the pages had paths of their own
// (#/ratings?v=1&…) still open their page.

import { INSIGHT_PAGES } from './insight-page-metadata.js';

/** The pages, by path. */
export const ROUTES = [
  '/',
  '/ratings',
  '/history',
  '/head-to-head',
  '/prediction',
  '/graph',
  '/methodology',
  '/methodology/simple',
  '/methodology/full',
  '/about',
];
/** Paths from earlier versions of the site (and of the shared links in the wild), and the page each one opens. */
export const ALIASES = {
  '/privacy': '/about',
  '/home': '/',
  '/geek/weekend': '/ratings',
  '/geek/data': '/ratings',
  ratings: '/ratings',
  '/simple/ratings': '/ratings',
  '/simple/rankings': '/ratings',
  charts: '/history',
  '/simple/history': '/history',
  '/geek/explore': '/history',
  lab: '/history',
  predictor: '/head-to-head',
  '/predictor': '/head-to-head',
  method: '/methodology',
  '/method': '/methodology',
  '/how-it-works': '/methodology',
  backtest: '/methodology',
  '/geek/models': '/methodology',
};

/**
 * Where an address of a page that is now a document of its own leads, or null: the Insights were a card of slides over the front page, and are
 * pages now (/insights, and one for each finding), so an old address of a slide (#/insights?v=1&slide=upsets) opens the finding's page.
 */
export function movedAddress(path, search) {
  if (path !== '/insights') return null;
  const page = INSIGHT_PAGES[new URLSearchParams(search).get('slide')];
  return page ? `/insights/${page.slug}` : '/insights';
}

/** Whether a path is one of the pages (or an earlier name of one), shown without loading a new document. */
export const isPagePath = (path) => ROUTES.includes(path) || path in ALIASES;

/** The path and options in the address; an address in the old form (#/ratings?v=1&…) is read the same way. */
export function currentAddress() {
  const [hashPath, hashSearch = ''] = location.hash.slice(1).split('?');
  if (hashPath && (isPagePath(hashPath) || movedAddress(hashPath, hashSearch))) return { path: hashPath, search: hashSearch };
  return { path: location.pathname.replace(/\/+$/, '') || '/', search: location.search.slice(1) };
}

/** Whether the address is in the old form, which the page then rewrites as a path. */
export const isOldAddress = () => {
  const [path, search = ''] = location.hash.slice(1).split('?');
  return isPagePath(path) || Boolean(movedAddress(path, search));
};

/** Moves to another page: a step in the browser's history, which Back takes back. */
export function goTo(address) {
  window.history.pushState(null, '', address);
  window.dispatchEvent(new CustomEvent('f1:address-changed'));
}
