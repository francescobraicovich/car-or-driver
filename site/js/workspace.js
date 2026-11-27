// Page shell: moving between the pages by their paths (address.js), and the weekend and history state kept in the URL.
import { state } from './state.js';
import { setRace } from './ratings-view.js';
import { createHistoryView } from './history-view.js';
import { DECK_PAGES, panelView } from './stage-pages.js';
import { ALIASES, ROUTES, currentAddress, goTo, isOldAddress, isPagePath } from './address.js';
import { PAGE_METADATA } from './page-metadata.js';

// Every route is the front page: the ratings are the panel on it, kept open; the history and the head to head are views over the ratings, in the
// panel; Insights, Prediction, Methodology and About & Privacy each open a card over it.
const DEFAULT_ROUTE = '/';
const VIEW_IDS = { history: 'historyView', 'head-to-head': 'headToHeadView' };
const $ = (id) => document.getElementById(id);

export function initWorkspace() {
  const root = $('workspace');
  const home = $('home');
  home.tabIndex = -1;
  let route = DEFAULT_ROUTE;
  let raceId = null;
  let deckSlide = null; // the id of the slide on the card of the page, if it is a card of slides (none: the contents)
  let raceDate = null;
  let restoring = false;

  const history = createHistoryView({
    onChange: () => {
      saveURL();
      window.dispatchEvent(new CustomEvent('f1:history-changed'));
    },
  });
  root.hidden = false;

  const pageName = () => (route === '/' ? 'home' : route.slice(1).replace('/', '-'));

  /** The page the body is on, and what the panel shows (the ratings, or a view over them). */
  function setPage() {
    document.body.dataset.page = pageName();
    $('stageLedger').dataset.view = panelView(pageName());
    if (panelView(pageName()) !== 'head-to-head') window.dispatchEvent(new CustomEvent('f1:versus-drivers', { detail: null })); // the two drivers lit in the race
  }

  function display() {
    setPage();
    document.title = PAGE_METADATA[route].title;
    $('chartValueTooltip')?.setAttribute('hidden', '');
    window.dispatchEvent(new CustomEvent('f1:workspace-changed', { detail: { page: route, slide: deckSlide } }));
  }

  function parseURL() {
    const { path, search } = currentAddress();
    let nextRoute = ROUTES.includes(path) ? path : ALIASES[path] || DEFAULT_ROUTE;
    const params = new URLSearchParams(search.length <= 16000 ? search : '');
    const accepted = params.get('v') === '1' ? params : new URLSearchParams();
    if (nextRoute === '/methodology' && /^method-/.test(accepted.get('slide') || '')) nextRoute = '/methodology/full';
    if (path === '/privacy' && !accepted.has('slide')) accepted.set('slide', 'privacy');
    return { route: nextRoute, params: accepted };
  }

  function readURLState(params) {
    history.readURL(params);
    deckSlide = /^[a-z0-9-]{1,48}$/.test(params.get('slide') || '') ? params.get('slide') : null;
    if (/^[A-Za-z0-9_-]{1,64}$/.test(params.get('race') || '')) {
      raceId = params.get('race');
      raceDate = null;
    }
  }

  function saveURL() {
    if (restoring) return;
    if (route === '/') {
      window.history.replaceState(null, '', '/'); // the front page has no options to remember
      return;
    }
    const params = new URLSearchParams({ v: '1' });
    history.writeURL(params);
    if (raceId) params.set('race', raceId);
    if (DECK_PAGES.includes(pageName()) && deckSlide) params.set('slide', deckSlide);
    window.history.replaceState(null, '', `${route}?${params}`);
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

  /** Where the focus goes on a new page: the button to go back, in a view over the ratings; the button that opened the view, when coming back from it. */
  function focusPage(was) {
    const now = panelView(pageName());
    let target = home;
    if (pageName() === 'graph') target = $('graphPage') ?? target;
    else if (pageName() === 'prediction') target = $('predictionPage') ?? target;
    else if (DECK_PAGES.includes(pageName()))
      target = document.querySelector(`.deck-card[data-deck="${pageName()}"]`) ?? target; // (the card is made when its page is first shown, and takes the focus itself then)
    else if (now !== 'ratings') target = $(VIEW_IDS[now]).querySelector('.ledger-back');
    else if (was !== 'ratings') target = $(was === 'history' ? 'ratingsOpenHistory' : 'ratingsOpenHeadToHead') ?? target;
    target.focus({ preventScroll: true });
  }

  /** Opens a view over the ratings from the ratings: a step forward in the browser's history, which Back then takes back. */
  let openedFromRatings = false;
  function openView(path) {
    openedFromRatings = true;
    goTo(path);
  }
  /** Back to the ratings: one step back in the browser's history when the view was opened from them (so that its Back button does not make the browser's back button return to the view), otherwise to the ratings. */
  function goBack() {
    if (openedFromRatings) window.history.back();
    else goTo('/ratings');
  }

  function navigate() {
    const target = parseURL();
    if (panelView(target.route.slice(1)) === 'ratings') openedFromRatings = false;
    const was = panelView(pageName());
    restoring = true;
    try {
      route = target.route;
      readURLState(target.params);
      restoreRace();
      history.refresh();
      display();
      focusPage(was);
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
    openView('/history');
  });
  window.addEventListener('f1:compare-head-to-head', () => {
    openView('/head-to-head');
  });
  window.addEventListener('f1:deck-slide', (event) => {
    if (event.detail.page !== pageName()) return;
    deckSlide = event.detail.id;
    saveURL();
  });
  window.addEventListener('f1:open-view', (event) => {
    const { view, entity } = event.detail;
    if (view === 'history') history.show(entity);
    openView(view === 'history' ? '/history' : '/head-to-head');
  });
  for (const button of document.querySelectorAll('.ledger-back')) button.addEventListener('click', goBack);
  window.addEventListener('f1:ledger-back', goBack);
  // keeping the ratings open on the front page is the Ratings page, and letting go of them is the front page: the address follows (a view over the
  // ratings is open only while they are, so letting go of the panel there is the front page too)
  window.addEventListener('f1:ratings-pinned', (event) => {
    const next = event.detail.pinned ? (panelView(pageName()) === 'ratings' ? '/ratings' : route) : '/';
    if (route === next || DECK_PAGES.includes(pageName())) return; // (a card of slides is not about the panel)
    route = next;
    setPage();
    saveURL();
  });
  window.addEventListener('f1:address-changed', navigate);
  window.addEventListener('popstate', navigate);
  window.addEventListener('hashchange', () => {
    if (isOldAddress()) navigate(); // a link in the old form (#/ratings) opens its page, and the address becomes its path
  });
  // a link to a page is followed without loading a new document (a link to another document, such as a driver's page, loads it)
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target || link.hasAttribute('download')) return;
    if (link.getAttribute('href').startsWith('#')) return; // a place on this page, or a link in the old form (which the hashchange follows)
    const url = new URL(link.href);
    if (url.origin !== location.origin || !isPagePath(url.pathname.replace(/\/+$/, '') || '/')) return;
    event.preventDefault();
    goTo(`${url.pathname}${url.search}`);
  });
  $('stage').addEventListener('pointerdown', (event) => {
    if (!DECK_PAGES.includes(pageName())) return;
    if (event.target.closest('.deck-card, .deck-list, .graph-page, .prediction-page, .stage-top, .stage-bottom, .track')) return;
    goTo('/');
  });
  window.addEventListener('f1:race-changed', () => {
    rememberRace();
    saveURL();
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
