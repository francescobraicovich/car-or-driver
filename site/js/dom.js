// Cached DOM element references. Call initDom() once on startup.
export const el = {};

const IDS = ['ratingsHost', 'chartsPanel'];

export function initDom() {
  for (const id of IDS) el[id] = document.getElementById(id);
}
