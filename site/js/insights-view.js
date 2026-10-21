// The Insights: the findings as a card of slides (slide-deck.js). The first slide is the contents (the five topics and the finding of each), then one
// slide for each finding: what it claims, a chart, and a note behind an "i" on how it was computed and where it can mislead. The numbers are a snapshot
// computed offline (insights-data.js); the page needs neither the loaded model nor the network.
import { INSIGHTS_DATA } from './insights-data.js';
import { INSIGHT_CARDS, INSIGHT_TOPICS } from './insights-cards.js';
import { infoHtml } from './info-tip.js';
import { createDeck } from './slide-deck.js';

const KINDS = {
  direct: ['Direct', 'Counted from the race results, with no rating involved.'],
  model: ['Model-based', 'Depends on how the ratings split a team’s result between driver and car.'],
};
const INTRO_NOTE =
  'Each finding is a claim, a chart, and a note on how it was computed and where it can mislead. They come from the same ratings as the rest of the site, with the raw race results where no rating is needed. Ratings are relative to the field of each weekend (1,000 is the average; 75 points is 10:1 odds), so comparisons across eras are thought experiments.';
const plain = (html) => html.replace(/<[^>]+>/g, ''); // the notes carry a little markup (bold run-in heads); the note behind an icon is plain text
const topicOf = (card) => INSIGHT_TOPICS.find((topic) => topic.id === card.topic);

function slideHtml(card, data) {
  const how = typeof card.how === 'function' ? card.how(data) : card.how;
  const [kind, kindNote] = KINDS[card.kind];
  return `<article class="insight" id="insight-${card.id}" data-card="${card.id}">
      <p class="insight-kind"><span class="insight-topic-name">${topicOf(card).title}</span><span class="insight-chip">${kind}</span></p>
      <h3 class="insight-title">${card.title}${infoHtml(`${kind}: ${kindNote} How it is computed: ${plain(how)}`)}</h3>
      <p class="insight-lead">${card.lead(data)}</p>
      ${card.body(data)}
    </article>`;
}

export function initInsights() {
  createDeck({
    page: 'insights',
    title: 'Insights',
    before: `<p class="insights-intro">Twenty findings on one question: how much of a Formula 1 result is the driver, and how much is the car?${infoHtml(INTRO_NOTE)}</p>`,
    after: `<p class="insights-kinds"><span class="insight-chip">${KINDS.direct[0]}</span><span class="insight-chip">${KINDS.model[0]}</span>${infoHtml(`${KINDS.direct[0]}: ${KINDS.direct[1]} ${KINDS.model[0]}: ${KINDS.model[1]}`)}</p>`,
    groups: INSIGHT_TOPICS.map((topic) => ({
      title: topic.title,
      slides: INSIGHT_CARDS.filter((card) => card.topic === topic.id).map((card) => ({
        id: card.id,
        label: card.label,
        title: card.title,
        html: slideHtml(card, INSIGHTS_DATA),
      })),
    })),
    firstShown: () => {
      for (const card of INSIGHT_CARDS) card.draw(INSIGHTS_DATA, document.getElementById(`insight-${card.id}`));
    },
  });
}
