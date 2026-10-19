// Insights page: cards that show how much of Formula 1 results belongs to the driver and how much to the car. The numbers are a
// snapshot computed offline (insights-data.js); the page needs neither the loaded model nor the network.
import { INSIGHTS_DATA } from './insights-data.js';
import { INSIGHT_CARDS, INSIGHT_TOPICS } from './insights-cards.js';

const KIND_LABELS = { direct: 'Direct', model: 'Model-based' };

function cardHtml(card, data) {
  const how = typeof card.how === 'function' ? card.how(data) : card.how;
  return `<article class="insight" id="insight-${card.id}" data-card="${card.id}">
    <p class="insight-kind"><span class="insight-chip insight-chip-${card.kind}">${KIND_LABELS[card.kind]}</span></p>
    <h4 class="insight-title">${card.title}</h4>
    <p class="insight-lead">${card.lead(data)}</p>
    ${card.body(data)}
    <p class="insight-how"><b>How it is computed.</b> ${how}</p>
  </article>`;
}

function pageHtml(data) {
  const contents = INSIGHT_TOPICS.map((topic) => {
    const links = INSIGHT_CARDS.filter((card) => card.topic === topic.id)
      .map((card) => `<li><a href="#" data-jump="insight-${card.id}">${card.title}</a></li>`)
      .join('');
    return `<div><h4>${topic.title}</h4><ul>${links}</ul></div>`;
  }).join('');
  const topics = INSIGHT_TOPICS.map((topic) => {
    const cards = INSIGHT_CARDS.filter((card) => card.topic === topic.id)
      .map((card) => cardHtml(card, data))
      .join('');
    return `<section class="insight-topic" id="insight-topic-${topic.id}"><h3>${topic.title}</h3>${cards}</section>`;
  }).join('');
  return `<p class="insight-intro">
      Twenty findings on one question: how much of a Formula 1 result is the driver and how much is the car? Each one is a claim, a chart, and a note on how it was computed
      and where it can mislead. They come from the same ratings as the rest of the site, with the raw race results where no rating is needed. Ratings are relative to the field of
      each weekend (1,000 is the average; 75 points is 10:1 odds), so comparisons across eras are thought experiments.
    </p>
    <p class="insight-intro">
      <span class="insight-chip insight-chip-direct">Direct</span> counted from the race results, with no rating involved.
      <span class="insight-chip insight-chip-model">Model-based</span> depends on how the ratings split a team's result between driver and car.
    </p>
    <nav class="insight-contents" aria-label="Findings">${contents}</nav>
    ${topics}`;
}

export function initInsights() {
  const body = document.getElementById('insightsBody');
  body.innerHTML = pageHtml(INSIGHTS_DATA);
  body.addEventListener('click', (event) => {
    const link = event.target.closest('[data-jump]');
    if (!link) return;
    event.preventDefault();
    document.getElementById(link.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  let drawn = false;
  window.addEventListener('f1:workspace-changed', () => {
    if (drawn || document.body.dataset.page !== 'insights') return;
    drawn = true;
    for (const card of INSIGHT_CARDS) card.draw(INSIGHTS_DATA, document.getElementById(`insight-${card.id}`));
  });
}
