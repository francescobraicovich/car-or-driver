// The simple methodology: a card of slides (slide-deck.js), one for each part of the text (methodology-simple-content.js), with the teaching
// figures it shares with the full methodology. It is the page `methodology-simple` (/methodology/simple). The text needs no loaded ratings:
// the odds curve reads the point scale of the model when it has loaded, 75 points per tenfold change in the odds otherwise, and the Ferrari
// weekend and the two runs of one career are drawn once the full model and the historical run have loaded.
import { drawOddsCurve, drawTwoRuns, drawWeekendChange } from './methodology-figures.js';
import { initBeliefUpdate, initCareerGraph, initSplitLab } from './methodology-interactives.js';
import { SIMPLE_CONTENT_HTML } from './methodology-simple-content.js';
import { state } from './state.js';
import { createDeck } from './slide-deck.js';

const $ = (id) => document.getElementById(id);

const LABELS = {
  'simple-problem': 'Why it is hard',
  'simple-odds': 'Ratings as chances',
  'simple-teammates': 'Teammates',
  'simple-model': 'A learning model',
  'simple-history': 'Looking back',
};

const SPLIT_READING =
  'The two drivers stay <b>20 points</b> apart, and each driver with the car stays exactly as fast. No result between these two drivers can tell one division of the credit from another.';

let modelFiguresDrawn = false;
function drawModelFigures() {
  if (modelFiguresDrawn || !(state.model?.snaps?.length > 1) || !state.retrospectiveModel || !$('simpleWeekendChart')) return;
  modelFiguresDrawn = true;
  drawWeekendChange($('simpleWeekendChart'), state.model);
  drawTwoRuns($('simpleTwoRunsChart'), state.model, state.retrospectiveModel);
}

export function initSimpleMethodology() {
  const text = document.createElement('div');
  text.innerHTML = SIMPLE_CONTENT_HTML;
  createDeck({
    page: 'methodology-simple',
    idPrefix: 'methodologySimple',
    title: 'Simple methodology',
    before:
      '<p class="deck-intro">How the ratings work, in plain words and without formulas.</p>' +
      '<p class="methodology-note">For every formula, setting and test, read the <a href="/methodology/full">full methodology</a>.</p>',
    groups: [
      {
        slides: [...text.querySelectorAll(':scope > .method-part')].map((part) => ({
          id: part.id,
          label: LABELS[part.id],
          title: part.querySelector('h3').textContent.replace(/^\d+\.\s*/, ''),
          html: `<div class="deck-text">${part.outerHTML}</div>`,
        })),
      },
    ],
    firstShown: () => {
      initSplitLab($('simpleSplitLab'), { reading: SPLIT_READING });
      drawOddsCurve($('simpleOddsChart'), state.model?.params?.scale ?? 75);
      initCareerGraph($('simpleCareerGraph'));
      initBeliefUpdate($('simpleBeliefUpdate'));
      drawModelFigures();
    },
  });
  window.addEventListener('f1:model-ready', drawModelFigures);
}
