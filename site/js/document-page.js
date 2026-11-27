// What every document page does (tools/page-template.mjs): the head (the tyre lets out the name of the site, and on a phone the links open from a
// button), and a press on the drawing around the panels closes the page, back to the front page, as a press beside a card does there. A list
// with a search field (the drivers, the teams) finds an entry as it is typed, and the page of two drivers runs the head to head.
import { initSiteHead } from './site-head.js';

initSiteHead(document.getElementById('siteHead'))(false);

const main = document.getElementById('content');
document.addEventListener('click', (event) => {
  if (event.button !== 0 || getSelection()?.toString()) return; // (a press that selected text closes nothing)
  if (event.target === main || event.target === document.body || event.target === document.documentElement) location.assign('/');
});

if (document.querySelector('[data-search-list]')) import('./search-list.js').then(({ initSearchLists }) => initSearchLists());
if (document.querySelector('#headToHead, #headToHeadIndex')) import('./pair-page.js').then(({ initPairPage }) => initPairPage());
