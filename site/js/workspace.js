// Page shell: hash routing between the pages, the theme toggle, the share link, and the weekend and history state kept in the URL.
import { state } from './state.js';
import { setRace } from './ratings-view.js';
import { createHistoryView } from './history-view.js';
import { createThemeButton } from './theme.js';

// route -> the section that is the page.
const PAGES = {
  '/': 'home',
  '/ratings': 'ratings',
  '/history': 'charts',
  '/head-to-head': 'headToHead',
  '/insights': 'insights',
  '/methodology': 'methodology',
  '/privacy': 'privacy',
  '/about': 'about',
};
const DEFAULT_ROUTE = '/';
// Hashes from earlier versions of the site (and of the shared links in the wild).
const ALIASES = {
  '/home': '/',
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
const $ = (id) => document.getElementById(id);
const visible = (node, on) => {
  node.hidden = !on;
  node.style.display = on ? '' : 'none';
};

export function initWorkspace() {
  const root = $('workspace');
  $('shareView').before(createThemeButton());

  const pages = new Map(Object.entries(PAGES).map(([path, id]) => [path, $(id)]));
  for (const [path, node] of pages) {
    node.classList.add('workspace-page');
    node.dataset.route = path;
    node.tabIndex = -1;
    visible(node, false);
  }
  let route = DEFAULT_ROUTE;
  let raceId = null;
  let raceDate = null;
  let restoring = false;

  const history = createHistoryView({
    onChange: () => {
      saveURL();
      window.dispatchEvent(new CustomEvent('f1:history-changed'));
    },
  });
  root.hidden = false;

  function display() {
    document.body.dataset.page = route === '/' ? 'home' : route.slice(1);
    for (const link of document.querySelectorAll('#workspaceLinks a')) {
      if (link.getAttribute('href') === `#${route}`) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    for (const [path, node] of pages) visible(node, path === route);
    $('chartValueTooltip')?.setAttribute('hidden', '');
    window.dispatchEvent(new CustomEvent('f1:workspace-changed', { detail: { page: route } }));
  }

  function parseURL() {
    const [path, search = ''] = location.hash.slice(1).split('?');
    const nextRoute = pages.has(path) ? path : ALIASES[path] || DEFAULT_ROUTE;
    const params = new URLSearchParams(search.length <= 16000 ? search : '');
    return { route: nextRoute, params: params.get('v') === '1' ? params : new URLSearchParams() };
  }

  function readURLState(params) {
    history.readURL(params);
    if (/^[A-Za-z0-9_-]{1,64}$/.test(params.get('race') || '')) {
      raceId = params.get('race');
      raceDate = null;
    }
  }

  function saveURL() {
    if (restoring) return;
    if (route === '/') {
      window.history.replaceState(null, '', '#/'); // the front page has no options to remember
      return;
    }
    const params = new URLSearchParams({ v: '1' });
    history.writeURL(params);
    if (raceId) params.set('race', raceId);
    window.history.replaceState(null, '', `#${route}?${params}`);
  }

  function rememberRace() {
    const snap = state.model?.snaps[state.raceIndex];
    if (snap) {
      raceId = String(snap.raceId);
      raceDate = snap.date;
    }
  }

  /** Show the weekend named by the URL (or, failing that, the closest date, or the latest). */
  function restoreRace() {
    const snaps = state.model?.snaps;
    if (!snaps?.length) return;
    let index = snaps.findIndex((snap) => String(snap.raceId) === raceId);
    if (index < 0 && raceDate)
      index = snaps.reduce(
        (best, snap, i) =>
          Math.abs(Date.parse(snap.date) - Date.parse(raceDate)) < Math.abs(Date.parse(snaps[best].date) - Date.parse(raceDate)) ? i : best,
        0,
      );
    if (index < 0) index = snaps.length - 1;
    setRace(index, { announce: false });
    rememberRace();
  }

  function navigate() {
    const target = parseURL();
    restoring = true;
    try {
      route = target.route;
      readURLState(target.params);
      restoreRace();
      history.refresh();
      display();
      pages.get(route).focus({ preventScroll: true });
      window.scrollTo(0, 0);
    } finally {
      restoring = false;
      saveURL();
    }
  }

  window.addEventListener('f1:compare-history', (event) => {
    const { entity, ids } = event.detail;
    if (!['driver', 'car'].includes(entity) || !Array.isArray(ids)) return;
    const snap = state.model?.snaps[state.raceIndex];
    history.compare(event.detail, snap ? +snap.year : history.state.to);
    location.hash = '/history';
  });
  window.addEventListener('f1:compare-head-to-head', () => {
    location.hash = '/head-to-head';
  });
  window.addEventListener('hashchange', navigate);
  window.addEventListener('f1:race-changed', () => {
    rememberRace();
    saveURL();
  });
  $('shareView').addEventListener('click', async () => {
    saveURL();
    try {
      await navigator.clipboard.writeText(location.href);
      $('shareStatus').textContent = 'Link copied';
      $('shareURL').hidden = true;
    } catch {
      $('shareURL').hidden = false;
      $('shareURL').value = location.href;
      $('shareURL').focus();
      $('shareURL').select();
      $('shareStatus').textContent = 'Copy link';
    }
  });
  window.addEventListener('f1:model-ready', () => {
    restoreRace();
    history.refresh();
    display();
    if (!restoring) saveURL();
  });
  const initial = parseURL();
  route = initial.route;
  readURLState(initial.params);
  display();
  saveURL();
}
