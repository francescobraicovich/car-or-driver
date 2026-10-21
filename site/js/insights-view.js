// The Insights: the findings as a slide show on a card in the middle of the front page. The first slide is the contents (the five topics and
// the finding of each), then one slide for each finding: what it claims, a chart, and a note behind an "i" on how it was computed and where it can
// mislead. A slide is reached from the contents, from the list of slides beside the card, from the ticks under its title, with the arrows (or the
// arrow keys) or by a swipe, and slides slide. The numbers are a snapshot computed offline (insights-data.js); the page needs neither the loaded
// model nor the network. The finding on the card is in the address (`slide=`), so that it can be shared.
import { INSIGHTS_DATA } from './insights-data.js';
import { INSIGHT_CARDS, INSIGHT_TOPICS } from './insights-cards.js';
import { infoHtml } from './info-tip.js';

const KINDS = {
  direct: ['Direct', 'Counted from the race results, with no rating involved.'],
  model: ['Model-based', 'Depends on how the ratings split a team’s result between driver and car.'],
};
const INTRO_NOTE =
  'Each finding is a claim, a chart, and a note on how it was computed and where it can mislead. They come from the same ratings as the rest of the site, with the raw race results where no rating is needed. Ratings are relative to the field of each weekend (1,000 is the average; 75 points is 10:1 odds), so comparisons across eras are thought experiments.';
const plain = (html) => html.replace(/<[^>]+>/g, ''); // the notes carry a little markup (bold run-in heads); the note behind an icon is plain text
const topicOf = (card) => INSIGHT_TOPICS.find((topic) => topic.id === card.topic);

function contentsHtml() {
  const topics = INSIGHT_TOPICS.map((topic) => {
    const items = INSIGHT_CARDS.map((card, index) => ({ card, index }))
      .filter(({ card }) => card.topic === topic.id)
      .map(
        ({ card, index }) =>
          `<li><button type="button" data-slide="${index + 1}"><span class="n">${index + 1}</span>${card.title}</button></li>`,
      )
      .join('');
    return `<section><h3>${topic.title}</h3><ol>${items}</ol></section>`;
  }).join('');
  return `<article class="insights-contents">
      <p class="insights-intro">Twenty findings on one question: how much of a Formula 1 result is the driver, and how much is the car?${infoHtml(INTRO_NOTE)}</p>
      <div class="insights-topics">${topics}</div>
      <p class="insights-kinds"><span class="insight-chip">${KINDS.direct[0]}</span><span class="insight-chip">${KINDS.model[0]}</span>${infoHtml(`${KINDS.direct[0]}: ${KINDS.direct[1]} ${KINDS.model[0]}: ${KINDS.model[1]}`)}</p>
    </article>`;
}

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
  const $ = (id) => document.getElementById(id);
  const card = $('insightsCard');
  const track = $('insightsTrack');
  const slides = ['Contents', ...INSIGHT_CARDS.map((entry) => entry.label)];
  const titles = ['Contents', ...INSIGHT_CARDS.map((entry) => entry.title)];
  const count = slides.length;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // the slides: the contents, then one for each finding
  track.innerHTML = [contentsHtml(), ...INSIGHT_CARDS.map((entry) => slideHtml(entry, INSIGHTS_DATA))]
    .map(
      (html, index) =>
        `<section class="insights-slide" data-slide="${index}" role="group" aria-roledescription="slide" aria-label="${index + 1} of ${count}: ${titles[index].replace(/"/g, '&quot;')}">${html}</section>`,
    )
    .join('');
  const slideNodes = [...track.children];

  // the ticks under the title (a gap between two topics), and the list of slides beside the card
  let tickHtml = `<button type="button" data-slide="0" aria-label="Contents" title="Contents" tabindex="-1"></button>`;
  let listHtml = `<button type="button" class="insights-list-home" data-slide="0">Contents</button>`;
  INSIGHT_TOPICS.forEach((topic) => {
    const entries = INSIGHT_CARDS.map((entry, index) => ({ entry, index: index + 1 })).filter(({ entry }) => entry.topic === topic.id);
    tickHtml += entries
      .map(
        ({ entry, index }, position) =>
          `<button type="button" data-slide="${index}"${position === 0 ? ' class="first"' : ''} aria-label="${entry.title.replace(/"/g, '&quot;')}" title="${entry.label}" tabindex="-1"></button>`, // (the ticks are for the pointer: the keys, the arrows and the contents are for the keyboard)
      )
      .join('');
    listHtml += `<section data-topic="${topic.id}"><h3>${topic.title}</h3><ol>${entries.map(({ entry, index }) => `<li><button type="button" data-slide="${index}">${entry.label}</button></li>`).join('')}</ol></section>`;
  });
  $('insightsTicks').innerHTML = tickHtml;
  $('insightsList').innerHTML = listHtml;
  const ticks = [...$('insightsTicks').children];
  const listButtons = [...$('insightsList').querySelectorAll('button')];
  const listTopics = [...$('insightsList').querySelectorAll('section')];

  let current = -1;
  const idOf = (index) => (index > 0 ? INSIGHT_CARDS[index - 1].id : null);

  /** Shows slide `index`: the track slides to it (at once when `animate` is false), and everything that says where we are is brought up to date. */
  function go(index, { animate = true, announce = true } = {}) {
    const next = Math.max(0, Math.min(count - 1, index));
    if (next === current) return;
    const first = current < 0;
    current = next;
    track.classList.toggle('still', first || !animate || reducedMotion.matches);
    track.style.transform = `translateX(${-100 * next}%)`;
    slideNodes.forEach((node, at) => {
      node.inert = at !== next;
      node.setAttribute('aria-hidden', String(at !== next));
    });
    slideNodes[next].scrollTop = 0;
    // on a short screen the list scrolls: the slide shown stays in view
    const list = $('insightsList');
    const entry = listButtons.find((button) => Number(button.dataset.slide) === next);
    if (entry && list.clientHeight) {
      if (entry.offsetTop < list.scrollTop) list.scrollTop = Math.max(0, entry.offsetTop - 28);
      else if (entry.offsetTop + entry.offsetHeight > list.scrollTop + list.clientHeight)
        list.scrollTop = entry.offsetTop + entry.offsetHeight - list.clientHeight + 8;
    }
    ticks.forEach((tick, at) => tick.setAttribute('aria-current', String(at === next)));
    for (const button of listButtons) button.setAttribute('aria-current', String(Number(button.dataset.slide) === next));
    for (const section of listTopics)
      section.toggleAttribute('data-current', next > 0 && section.dataset.topic === INSIGHT_CARDS[next - 1].topic); // the topic of the slide shown
    $('insightsPosition').textContent = `${next + 1} / ${count}`;
    $('insightsName').textContent = slides[next];
    $('insightsPrevious').disabled = next === 0;
    $('insightsNext').disabled = next === count - 1;
    if (announce) window.dispatchEvent(new CustomEvent('f1:insights-slide', { detail: { id: idOf(next) } }));
  }

  card.addEventListener('click', (event) => {
    const target = event.target.closest('[data-slide]');
    if (target) go(Number(target.dataset.slide));
  });
  $('insightsList').addEventListener('click', (event) => {
    const target = event.target.closest('[data-slide]');
    if (target) go(Number(target.dataset.slide));
  });
  $('insightsPrevious').addEventListener('click', () => go(current - 1));
  $('insightsNext').addEventListener('click', () => go(current + 1));
  $('insightsClose').addEventListener('click', () => (location.hash = '#/'));

  // a swipe, with a finger (a mouse selects text and drags the scroll bar: it has the buttons and the keys)
  let swipe = null;
  $('insightsSlides').addEventListener('pointerdown', (event) => {
    swipe = event.pointerType === 'touch' ? { x: event.clientX, y: event.clientY } : null;
  });
  $('insightsSlides').addEventListener('pointerup', (event) => {
    if (!swipe) return;
    const [dx, dy] = [event.clientX - swipe.x, event.clientY - swipe.y];
    swipe = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 2 * Math.abs(dy)) go(current + (dx < 0 ? 1 : -1));
  });

  // the keys, while the Insights are shown (an open note takes its Escape first: it prevents the default)
  window.addEventListener('keydown', (event) => {
    if (document.body.dataset.page !== 'insights' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement
    )
      return;
    const to = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: count - 1 }[event.key];
    if (to !== undefined) {
      event.preventDefault();
      go(to);
    } else if (event.key === 'Escape') location.hash = '#/';
  });

  // the finding in the address, when the page is shown (or the address changes); the charts are drawn the first time the card has a width
  const slideInAddress = () => {
    const id = new URLSearchParams(location.hash.split('?')[1] || '').get('slide');
    const at = INSIGHT_CARDS.findIndex((entry) => entry.id === id);
    return at < 0 ? 0 : at + 1;
  };
  let drawn = false;
  window.addEventListener('f1:workspace-changed', () => {
    if (document.body.dataset.page !== 'insights') return;
    go(slideInAddress(), { animate: false, announce: false });
    if (drawn) return;
    drawn = true;
    for (const entry of INSIGHT_CARDS) entry.draw(INSIGHTS_DATA, $(`insight-${entry.id}`));
  });
}
