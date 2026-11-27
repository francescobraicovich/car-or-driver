// The full methodology: a card of slides (slide-deck.js), one for each part of the text (methodology-content.js), with its formulas typeset, its
// settings filled from the loaded model, its teaching figures (methodology-interactives.js) and the figures and tables drawn from the published
// model (methodology-figures.js). It is the page `methodology-full` (/methodology/full); its ids keep the prefix `methodology`.
import { state } from './state.js';
import { summarizeBacktest } from '../../packages/core/src/backtest.js';
import { CONTENT_HTML } from './methodology-content.js';
import {
  drawCareerAcrossTeams,
  drawMissPull,
  drawOddsCurve,
  drawReliability,
  drawSeasonScores,
  drawTwoRuns,
  drawUncertaintyOverTime,
  drawWeekendChange,
} from './methodology-figures.js';
import { initBeliefUpdate, initCareerGraph, initSplitLab } from './methodology-interactives.js';
import { createDeck } from './slide-deck.js';

const $ = (id) => document.getElementById(id);

const LABELS = {
  'method-questions': 'The question',
  'method-data': 'The data',
  'method-ratings': 'What a rating means',
  'method-separation': 'Separating driver and car',
  'method-model': 'The state-space model',
  'method-filter': 'Running forward',
  'method-history': 'Refitting history',
  'method-forecast': 'Predictions',
  'method-evidence': 'Evidence',
  'method-limits': 'Limits and sources',
};
const COIN_FLIP = Math.LN2;
const PUBLISHED_QUALIFYING_SCALE = 1.944; // the logistic scale of qualifying gaps, for the first screen before the model's settings load
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

/** The weekends, drivers, cars and comparisons of the chronological run, from the published model. */
function fillCoverage(model) {
  const [first, latest] = [model.snaps[0], model.snaps.at(-1)];
  const drivers = new Set(model.snaps.flatMap((snap) => snap.drivers.map((row) => row.driverId))).size;
  const cars = new Set(model.snaps.flatMap((snap) => snap.cars.map((row) => row.carId))).size;
  const comparisons = model.snaps.reduce((sum, snap) => sum + snap.evidence.qual + snap.evidence.race + snap.evidence.overall, 0);
  $('methodologyCoverage').textContent =
    `${model.snaps.length} Grand Prix weekends, from the ${first.year} ${first.name} to the ${latest.year} ${latest.name}, and rates ` +
    `${drivers} drivers and ${cars} cars from ${comparisons.toLocaleString('en-GB')} comparisons`;
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
  fillCoverage(model);
  fillValidation(model);
  if (modelFiguresDrawn || !state.displayModel?.dh?.size) return;
  modelFiguresDrawn = true;
  drawSeasonScores($('methodologySeasonChart'), model);
  drawUncertaintyOverTime($('methodologyUncertaintyChart'), model);
  drawWeekendChange($('methodologyWeekendChart'), model);
  if (state.retrospectiveModel) drawTwoRuns($('methodologyTwoRunsChart'), model, state.retrospectiveModel);
  const name = drawCareerAcrossTeams($('methodologyCareerChart'), state.displayModel);
  if (name)
    $('methodologyCareerCaption').textContent =
      `${name}: overall strength after every weekend of their career (blue), and the overall strength of the car they drove (red), on the published historical ratings (Section 7). The driver's line runs on through each team change, while the car's line jumps to the new car.`;
}

/** KaTeX, which only this page uses: its style sheet and script, fetched the first time the page opens. */
function loadKatex() {
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/vendor/katex/katex.min.css' }));
  return new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), { src: '/vendor/katex/katex.min.js' });
    script.addEventListener('load', resolve);
    script.addEventListener('error', () => reject(Error('KaTeX could not be loaded')));
    document.head.append(script);
  });
}

export async function initMethodology() {
  await loadKatex();
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
      '<p class="deck-intro">How race results become driver ratings, car ratings and forecasts, and how well they hold up.</p>' +
      '<p class="methodology-note">This methodology was written by AI and corrected by the author of this website. For the idea in plain words, read the <a href="/methodology/simple">simple methodology</a>.</p>',
    groups: [{ title: 'Method', slides }],
    firstShown: () => {
      drawOddsCurve($('methodologyOddsChart'), state.model?.params?.scale ?? 75);
      initSplitLab($('methodologySplitLab'));
      initCareerGraph($('methodologyCareerGraph'));
      initBeliefUpdate($('methodologyBeliefUpdate'));
      drawMissPull($('methodologyMissPullChart'), state.model?.params?.parameters?.noise?.[0] ?? PUBLISHED_QUALIFYING_SCALE);
      drawReliability($('methodologyReliabilityChart'));
      render();
    },
  });
  window.addEventListener('f1:model-ready', render);
  window.addEventListener('f1:workspace-changed', () => {
    if (document.body.dataset.page === 'methodology-full') render();
  });
}
