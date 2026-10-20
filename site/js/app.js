// App entrypoint: DOM init, page wiring, first data load.
import { el, initDom } from './dom.js';
import { loadModel } from './model-loader.js';
import { initWorkspace } from './workspace.js';
import { initHeadToHead } from './head-to-head-view.js';
import { initStage } from './stage-view.js';
import { initTrack } from './track-view.js';

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

/** The ratings could not be built: say why in the loading veil, which stays up (there is nothing behind it to show). */
function showLoadError(error) {
  document.querySelector('#veil .spinner')?.setAttribute('hidden', '');
  document.getElementById('veilTitle').textContent = 'The ratings could not be loaded';
  document.getElementById('veilMsg').textContent = 'Reloading the page usually fixes a network hiccup.';
  const box = document.getElementById('veilError');
  box.hidden = false;
  box.textContent = error?.message || String(error);
  // the front page hides the loading screen, so it shows the failure itself
  window.dispatchEvent(new CustomEvent('f1:ratings-failed', { detail: { message: box.textContent } }));
}

window.addEventListener('DOMContentLoaded', () => {
  initDom();
  window.__appBooted = true;
  initHeadToHead();
  initWorkspace();
  initStage();
  initTrack();
  // First successful build dismisses the loading veil and marks status ready.
  const dismissVeil = () => {
    document.getElementById('veil')?.classList.add('gone');
    el.status.closest('.status-pill')?.classList.add('ready');
  };
  window.addEventListener('f1:ratings-ready', dismissVeil, { once: true });
  window.addEventListener('f1:model-ready', dismissVeil, { once: true });
  loadModel().catch(showLoadError);
});
