// The page of one finding (/insights/best-f1-driver-of-all-time, written by tools/insight-pages.mjs): the slide is in the page, and this draws
// its chart and opens its notes, as on the card of the Insights (insights-view.js). No storage, no requests beyond the modules.
import { INSIGHTS_DATA } from './insights-data.js';
import { INSIGHT_CARDS } from './insights-cards.js';
import { initInfoTips } from './info-tip.js';

const slide = document.querySelector('.insight[data-card]');
INSIGHT_CARDS.find((card) => card.id === slide?.dataset.card)?.draw(INSIGHTS_DATA, slide);
initInfoTips();
