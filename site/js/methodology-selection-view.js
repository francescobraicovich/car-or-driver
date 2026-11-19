// The card that opens the Methodology: two boxes, one for the simple methodology (methodology-simple-view.js) and one for the full methodology
// (methodology-view.js). It has the head of a card of slides (slide-deck.js) and no slides. No storage, no requests.

const OPTIONS = [
  {
    href: '#/methodology/simple',
    kind: 'Simple',
    title: 'The idea in plain words',
    text: 'Four short slides without formulas: why the split between driver and car is hard, ratings as chances of winning, what teammates reveal, and a model that keeps learning.',
  },
  {
    href: '#/methodology/full',
    kind: 'Full',
    title: 'The complete method',
    text: 'Thirteen parts with every comparison, formula, setting and test, the evidence for each step, the limitations and the references.',
  },
];

export function initMethodologySelection() {
  const card = Object.assign(document.createElement('section'), {
    id: 'methodologySelectionCard',
    className: 'deck-card methodology-selection',
    tabIndex: -1,
    innerHTML: `
      <header class="deck-head">
        <h2 class="deck-title">Methodology</h2>
        <button type="button" class="deck-close" id="methodologySelectionClose" aria-label="Close the Methodology">×</button>
      </header>
      <div class="methodology-selection-body">
        <p class="deck-intro">How race results become driver ratings, car ratings and forecasts. Choose how deep to go.</p>
        <ul class="methodology-selection-options">
          ${OPTIONS.map(
            (option) => `<li><a class="methodology-selection-option" href="${option.href}">
              <span class="methodology-selection-kind">${option.kind}</span>
              <strong>${option.title}</strong>
              <span>${option.text}</span>
            </a></li>`,
          ).join('')}
        </ul>
      </div>`,
  });
  card.dataset.deck = 'methodology';
  card.setAttribute('aria-label', 'Methodology');
  document.getElementById('stage').append(card);
  card.querySelector('.deck-close').addEventListener('click', () => (location.hash = '#/'));
  window.addEventListener('keydown', (event) => {
    if (document.body.dataset.page !== 'methodology' || event.defaultPrevented || event.key !== 'Escape') return;
    location.hash = '#/';
  });
  let wasOpen = false;
  const show = () => {
    const open = document.body.dataset.page === 'methodology';
    card.toggleAttribute('data-open', open);
    if (open && !wasOpen) card.focus({ preventScroll: true });
    wasOpen = open;
  };
  window.addEventListener('f1:workspace-changed', show);
  show();
}
