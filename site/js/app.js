// App entrypoint: DOM init, page wiring, first data load.
import { initDom } from './dom.js';
import { loadModel } from './model-loader.js';
import { initWorkspace } from './workspace.js';
import { initHeadToHead } from './head-to-head-view.js';
import { initStage } from './stage-view.js';
import { initTrack } from './track-view.js';
import { initInfoTips } from './info-tip.js';

// Insights, Methodology, Privacy and About are fetched the first time they are opened, not on every visit.
const lazyPages = {
  insights: async () => (await import('./insights-view.js')).initInsights,
  methodology: async () => (await import('./methodology-view.js')).initMethodology,
  privacy: async () => (await import('./legal-view.js')).initLegal,
  about: async () => (await import('./legal-view.js')).initLegal,
};
const started = new Set();
window.addEventListener('f1:workspace-changed', async () => {
  const page = document.body.dataset.page;
  if (!lazyPages[page] || started.has(page)) return;
  started.add(page);
  (await lazyPages[page]())();
  window.dispatchEvent(new CustomEvent('f1:workspace-changed', { detail: { page } })); // so the page that has just started draws itself
});

/** The ratings could not be loaded: the front page says why, in the line at its foot (stage-view.js). */
function showLoadError(error) {
  window.dispatchEvent(new CustomEvent('f1:ratings-failed', { detail: { message: error?.message || String(error) } }));
}

window.addEventListener('DOMContentLoaded', () => {
  initDom();
  window.__appBooted = true;
  initHeadToHead();
  initWorkspace();
  initTrack(); // before the stage, which says at once if the ratings are shown (a link to #/ratings)
  initStage();
  initInfoTips();
  loadModel().catch(showLoadError);
});
