import { state } from './state.js';
import { summarizeBacktest } from '../../packages/core/src/backtest.js';
import { CONTENT_HTML } from './methodology-content.js';
import { createDeck } from './slide-deck.js';

function render() {
  const model = state.model;
  if (model?.params?.modelKind !== 'unified') return;
  for (const node of document.querySelectorAll('[data-setting]')) {
    const value = model.params.parameters[node.dataset.setting];
    node.textContent = Array.isArray(value) ? value.map((x) => x.toFixed(3)).join(' (qualifying), ') + ' (race pace)' : String(value);
  }
  const publication = document.getElementById('methodologyPublication');
  const latest = model.snaps.at(-1);
  if (publication)
    publication.textContent = `Ratings through ${latest.date}, ${latest.name}. Model: unified, version ${model.params.version}. Filtered source: ${state.modelSourceHash || 'loading'}. Historical refit: ${state.retrospectiveSourceHash || 'loading'}.`;
  const summary = document.getElementById('methodologyValidationSummary');
  if (summary) {
    const historical = summarizeBacktest(model, { fromYear: 2008, toYear: 2025, burnIn: 0 });
    const monitoring = summarizeBacktest(model, { fromYear: 2026, burnIn: 0 });
    summary.textContent = `This publication’s chronological replay: ${historical.weekends} scored historical weekends, race-result log loss ${historical.overall.raceLogLoss.toFixed(5)}. Monitoring from 2026: ${monitoring.weekends} weekends, log loss ${monitoring.overall.raceLogLoss.toFixed(5)}. These are pre-update, race-balanced scores from the unified model.`;
  }
}

export function initMethodology() {
  const text = document.createElement('div');
  text.innerHTML = CONTENT_HTML;
  for (const node of text.querySelectorAll('[data-math], [data-math-display]')) {
    window.katex.render(node.textContent, node, { displayMode: node.hasAttribute('data-math-display') });
  }
  const labels = [
    'Contributions',
    'Evidence',
    'Driver and car',
    'Shared learning',
    'Updating',
    'Reading ratings',
    'Forecasts',
    'Validation',
    'Limits',
    'Sources',
  ];
  createDeck({
    page: 'methodology',
    title: 'Methodology',
    before:
      '<p class="deck-intro">How teammate comparisons separate driver and car contributions, how the ratings become forecasts, and what the evidence can establish. Open the technical details for equations and settings.</p>',
    groups: [
      {
        slides: [...text.querySelectorAll(':scope > .method-part')].map((part, index) => ({
          id: part.id,
          label: labels[index],
          title: part.querySelector('h3').textContent.replace(/^\d+\.\s*/, ''),
          html: `<div class="deck-text">${part.outerHTML}</div>`,
        })),
      },
    ],
    firstShown: render,
  });
  window.addEventListener('f1:model-ready', render);
  window.addEventListener('f1:workspace-changed', () => {
    if (document.body.dataset.page === 'methodology') render();
  });
}
