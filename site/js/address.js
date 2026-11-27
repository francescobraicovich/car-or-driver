// The address of a page of the site: its path (/ratings) and its options (?v=1&…). Every page is the front page with something over it
// (stage-pages.js), so moving between them changes the address without loading a new document. Links from before the pages had paths of their own
// (#/ratings?v=1&…) still open their page.

/** The pages, by path. */
export const ROUTES = [
  '/',
  '/ratings',
  '/history',
  '/head-to-head',
  '/prediction',
  '/graph',
  '/insights',
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

/** Whether a path is one of the pages (or an earlier name of one), shown without loading a new document. */
export const isPagePath = (path) => ROUTES.includes(path) || path in ALIASES;

/** The path and options in the address; an address in the old form (#/ratings?v=1&…) is read the same way. */
export function currentAddress() {
  const [hashPath, hashSearch = ''] = location.hash.slice(1).split('?');
  if (hashPath && isPagePath(hashPath)) return { path: hashPath, search: hashSearch };
  return { path: location.pathname.replace(/\/+$/, '') || '/', search: location.search.slice(1) };
}

/** Whether the address is in the old form, which the page then rewrites as a path. */
export const isOldAddress = () => isPagePath(location.hash.slice(1).split('?')[0]);

/** Moves to another page: a step in the browser's history, which Back takes back. */
export function goTo(address) {
  window.history.pushState(null, '', address);
  window.dispatchEvent(new CustomEvent('f1:address-changed'));
}
