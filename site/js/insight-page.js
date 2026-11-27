// The pages of the findings (/insights, and /insights/best-f1-driver-of-all-time …, written by tools/insight-pages.mjs): their cards are in the page,
// and this draws the chart of each and opens their notes. No storage, no requests beyond the modules.
import { INSIGHTS_DATA } from './insights-data.js';
import { INSIGHT_CARDS } from './insights-cards.js';
import { initInfoTips } from './info-tip.js';

for (const card of document.querySelectorAll('.insight[data-card]'))
  INSIGHT_CARDS.find((finding) => finding.id === card.dataset.card)?.draw(INSIGHTS_DATA, card);
initInfoTips();
