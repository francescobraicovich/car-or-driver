// A long list of links with a search field above it (the drivers, the teams: tools/driver-and-team-pages.mjs). The whole list is in the page, for
// readers without scripts and for search engines; with this script only the entries that match what is typed show, a few at a time, and Enter
// opens the first of them. Accents and case do not matter: "raikkonen" finds Kimi Räikkönen.
const MOST_SHOWN = 12;
const plain = (text) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function initSearchLists() {
  for (const box of document.querySelectorAll('[data-search-list]')) {
    const input = box.querySelector('input[type="search"]');
    const items = [...box.querySelectorAll('li')].map((item) => ({ item, words: plain(item.textContent) }));
    const status = box.querySelector('[role="status"]');
    box.dataset.searching = 'true'; // the list is hidden until something is typed
    const show = () => {
      const query = plain(input.value.trim());
      let shown = 0;
      for (const { item, words } of items) {
        const match = query !== '' && words.includes(query) && shown < MOST_SHOWN;
        item.hidden = !match;
        if (match) shown++;
      }
      const found = query === '' ? 0 : items.filter(({ words }) => words.includes(query)).length;
      status.textContent =
        query === '' ? '' : found === 0 ? 'Nothing found.' : found > MOST_SHOWN ? `${found} found; the first ${MOST_SHOWN} shown.` : '';
    };
    input.addEventListener('input', show);
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const first = items.find(({ item }) => !item.hidden)?.item.querySelector('a');
      if (first) location.assign(first.href);
    });
    show();
  }
}
