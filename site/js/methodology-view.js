// The full methodology: a card of slides (slide-deck.js), one for each part of the text (methodology-content.js), with its formulas typeset, its
// settings filled from the loaded model, its teaching figures (methodology-interactives.js) and the figures and tables drawn from the published
// model (methodology-figures.js). It is the page `methodology-full` (#/methodology/full); its ids keep the prefix `methodology`.
import { state } from './state.js';
import { summarizeBacktest } from '../../packages/core/src/backtest.js';
import { CONTENT_HTML } from './methodology-content.js';
import { drawCareerAcrossTeams, drawOddsCurve, drawSeasonScores } from './methodology-figures.js';
import { initBeliefUpdate, initCareerGraph, initSplitLab } from './methodology-interactives.js';
import { createDeck } from './slide-deck.js';

const $ = (id) => document.getElementById(id);

const LABELS = {
  'method-questions': 'The question',
  'method-evidence': 'Times and results',
  'method-odds': 'Ratings and odds',
  'method-separation': 'Separating driver and car',
  'method-joint': 'Learning together',
  'method-time': 'Changes over time',
  'method-update': 'Updating ratings',
  'method-scale': 'Reading the ratings',
  'method-forecast': 'Race predictions',
  'method-validation': 'Testing the model',
  'method-limits': 'Limits of the ratings',
  'method-settings': 'Settings',
  'method-references': 'References',
};
// The reference material after the narrative, which ends with the limitations.
const APPENDIX = new Set(['method-settings', 'method-references']);
const COIN_FLIP = Math.LN2;
const PERIODS = [
  ['2008–2011', 2008, 2011],
  ['2012–2015', 2012, 2015],
  ['2016–2020', 2016, 2020],
  ['2021–2025', 2021, 2025],
  ['2008–2025', 2008, 2025],
];

const percent = (value) => `${(100 * value).toFixed(1)}%`;

/** The forecast score of each evaluation period, from the pre-update scores the model file keeps for every weekend. */
function fillValidation(model) {
  const row = (label, summary, strong = false) => {
    const { raceLogLoss, raceAcc, raceBrier } = summary.overall;
    const cells = [summary.weekends, raceLogLoss.toFixed(3), percent(raceAcc), raceBrier.toFixed(3)];
    return `<tr><th scope="row" class="left">${label}</th>${cells.map((cell) => `<td>${strong ? `<b>${cell}</b>` : cell}</td>`).join('')}</tr>`;
  };
  const monitoring = summarizeBacktest(model, { fromYear: 2026, burnIn: 0 });
  $('methodologyBlocks').innerHTML = [
    ...PERIODS.map(([label, fromYear, toYear], index) =>
      row(label, summarizeBacktest(model, { fromYear, toYear, burnIn: 0 }), index === PERIODS.length - 1),
    ),
    monitoring.weekends ? row('2026, as it happens', monitoring) : '',
    `<tr><th scope="row" class="left">A coin flip</th><td></td><td>${COIN_FLIP.toFixed(3)}</td><td>50.0%</td><td>0.250</td></tr>`,
  ].join('');
  const historical = summarizeBacktest(model, { fromYear: 2008, toYear: 2025, burnIn: 0 });
  $('methodologyValidationSummary').textContent =
    `Across 2008 to 2025 the forecasts score a log loss of ${historical.overall.raceLogLoss.toFixed(5)} over ${historical.weekends} weekends, ` +
    `and the favourite finishes ahead in ${percent(historical.overall.raceAcc)} of pairs.` +
    (monitoring.weekends ? ` In 2026, ${monitoring.weekends} weekends so far score ${monitoring.overall.raceLogLoss.toFixed(5)}.` : '');
}

let modelFiguresDrawn = false;
function render() {
  const model = state.model;
  if (model?.params?.modelKind !== 'unified') return;
  for (const node of document.querySelectorAll('#methodologyCard [data-setting]')) {
    const value = model.params.parameters[node.dataset.setting];
    node.textContent = Array.isArray(value) ? value.map((x) => x.toFixed(3)).join(' (qualifying), ') + ' (race pace)' : String(value);
  }
  const latest = model.snaps.at(-1);
  $('methodologyPublication').textContent =
    `Ratings through ${latest.date}, ${latest.name}. Model version ${model.params.version}. Chronological source: ${state.modelSourceHash || 'loading'}. Historical source: ${state.retrospectiveSourceHash || 'loading'}.`;
  if (model.snaps.length < 2) return; // the first screen carries the latest weekend only; the full history follows
  fillValidation(model);
  if (modelFiguresDrawn || !state.displayModel?.dh?.size) return;
  modelFiguresDrawn = true;
  drawSeasonScores($('methodologySeasonChart'), model);
  const name = drawCareerAcrossTeams($('methodologyCareerChart'), state.displayModel);
  if (name)
    $('methodologyCareerCaption').textContent =
      `${name}: overall strength after every weekend of their career (blue), and the overall strength of the car they drove (red), on the published historical ratings. The driver's line runs on through each team change; the car's line jumps to the new car.`;
}

export function initMethodology() {
  const text = document.createElement('div');
  text.innerHTML = CONTENT_HTML;
  for (const node of text.querySelectorAll('[data-math], [data-math-display]')) {
    window.katex.render(node.textContent, node, { displayMode: node.hasAttribute('data-math-display') });
  }
  const slides = [...text.querySelectorAll(':scope > .method-part')].map((part) => ({
    id: part.id,
    label: LABELS[part.id],
    title: part.querySelector('h3').textContent.replace(/^\d+\.\s*/, ''),
    html: `<div class="deck-text">${part.outerHTML}</div>`,
  }));
  createDeck({
    page: 'methodology-full',
    idPrefix: 'methodology',
    title: 'Full methodology',
    before:
      '<p class="deck-intro">How race results become driver ratings, car ratings and forecasts, and how every step was tested against the future.</p>' +
      '<p class="methodology-note">This methodology was written by AI and corrected by the author of this website. For the idea in plain words, read the <a href="#/methodology/simple">simple methodology</a>.</p>',
    groups: [
      { title: 'Method', slides: slides.filter((slide) => !APPENDIX.has(slide.id)) },
      { title: 'Appendix', slides: slides.filter((slide) => APPENDIX.has(slide.id)) },
    ],
    firstShown: () => {
      drawOddsCurve($('methodologyOddsChart'), state.model?.params?.scale ?? 75);
      initSplitLab($('methodologySplitLab'));
      initCareerGraph($('methodologyCareerGraph'));
      initBeliefUpdate($('methodologyBeliefUpdate'));
      render();
    },
  });
  window.addEventListener('f1:model-ready', render);
  window.addEventListener('f1:workspace-changed', () => {
    if (document.body.dataset.page === 'methodology-full') render();
  });
}
