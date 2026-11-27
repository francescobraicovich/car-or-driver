// The card of a finding of the Insights: what it claims, a place for its chart, and a note behind an "i" on how it was computed and where it can
// mislead. The pages of the findings (tools/insight-pages.mjs) are made of these cards, and draw their charts in the browser (insight-page.js). The
// numbers are a snapshot computed offline (insights-data.js).
import { INSIGHT_TOPICS } from './insights-cards.js';
import { infoHtml } from './info-tip.js';

/** The two kinds of finding, and what each rests on. */
export const KINDS = {
  direct: ['Direct', 'Counted from the race results, with no rating involved.'],
  model: ['Model-based', 'Depends on how the ratings split a team’s result between driver and car.'],
};
/** How to read the findings, for the page of all of them. */
export const INTRO_NOTE =
  'Each finding is a claim, a chart, and a note on how it was computed and where it can mislead. The rating extremes use the same retrospective display ratings as Ratings and History. Other model-based findings use the filtered ratings available at each date. Direct findings use the raw race results. Ratings, History and Graph use a recent-era display reference with a 20-weekend half-life. Other findings use the underlying model estimates: those labelled above the field subtract the actual weekend average, including its covariance when calculating uncertainty. A 75-point overall gap gives 10:1 raw odds before forecast adjustments. Comparisons across eras are thought experiments.';
const plain = (html) => html.replace(/<[^>]+>/g, ''); // the notes carry a little markup (bold run-in heads); the note behind an icon is plain text
const topicOf = (card) => INSIGHT_TOPICS.find((topic) => topic.id === card.topic);

/**
 * The card of a finding, from the data of the Insights. On the finding's own page (`{ alone: true }`) the page's heading asks the question, so the
 * card has no title of its own: the answer comes first, with how it was computed behind the "i" beside it.
 */
export function insightCardHtml(card, data, { alone = false } = {}) {
  const how = typeof card.how === 'function' ? card.how(data) : card.how;
  const [kind, kindNote] = KINDS[card.kind];
  const note = infoHtml(`${kind}: ${kindNote} How it is computed: ${plain(how)}`);
  const head = alone
    ? `<p class="insight-lead">${card.lead(data)}${note}</p>`
    : `<p class="insight-kind"><span class="insight-topic-name">${topicOf(card).title}</span><span class="insight-chip">${kind}</span></p>
      <h3 class="insight-title">${card.title}${note}</h3>
      <p class="insight-lead">${card.lead(data)}</p>`;
  return `<article class="insight" id="insight-${card.id}" data-card="${card.id}">
      ${head}
      ${card.body(data)}
    </article>`;
}
