// A card of slides in the middle of the front page, with a list of the slides beside it: the Insights, the Methodology, the Privacy notice and the About
// page are each one. The first slide is the contents (the slides, grouped), then the slides, which slide. They are reached from the contents, from the
// list beside the card (where there is room), from the ticks under the title, with the arrows and the arrow keys, by a swipe, or by a link in the text
// (an element with `data-jump` names the element it leads to); the slide on the card is in the address (`slide=`), so that a link opens it. A deck is
// made the first time its page is shown (the module of the page calls createDeck), and shown only on its page. No storage, no requests.
import { esc } from './utils.js';

const attribute = (text) => esc(text);

/**
 * @param {object} options
 * @param {string} options.page      the route name of the page (`insights`): the ids of the parts of the deck start with it
 * @param {string} options.title     the title in the head of the card
 * @param {string} [options.before]  HTML above the contents
 * @param {string} [options.after]   HTML below the contents
 * @param {{title?: string, slides: {id: string, label: string, title: string, html: string}[]}[]} options.groups
 * @param {() => void} [options.firstShown]  called once, the first time the card is on the screen (the charts are drawn then, when they have a width)
 */
export function createDeck({ page, title, before = '', after = '', groups, firstShown }) {
  const stage = document.getElementById('stage');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const entries = groups.flatMap((group) => group.slides);
  const labels = ['Contents', ...entries.map((entry) => entry.label)];
  const titles = ['Contents', ...entries.map((entry) => entry.title)];
  const count = labels.length;
  const idOf = (index) => (index > 0 ? entries[index - 1].id : null);

  // the contents slide: the groups, and in each the title of every slide as a row that jumps to it
  let index = 0;
  const topics = groups
    .map((group) => {
      const items = group.slides
        .map((slide) => `<li><button type="button" data-slide="${++index}"><span class="n">${index}</span>${slide.title}</button></li>`)
        .join('');
      return `<section>${group.title ? `<h3>${group.title}</h3>` : ''}<ol>${items}</ol></section>`;
    })
    .join('');
  const contents = `<article class="deck-contents">${before}<div class="deck-topics">${topics}</div>${after}</article>`;

  const slideHtml = [contents, ...entries.map((entry) => entry.html)];
  const track = slideHtml
    .map(
      (html, at) =>
        `<section class="deck-slide" data-slide="${at}" role="group" aria-roledescription="slide" aria-label="${at + 1} of ${count}: ${attribute(titles[at])}">${html}</section>`,
    )
    .join('');

  // the ticks under the title (a gap between two groups) and the list of slides beside the card
  let tickHtml = `<button type="button" data-slide="0" aria-label="Contents" title="Contents" tabindex="-1"></button>`;
  let listHtml = `<button type="button" class="deck-list-home" data-slide="0">Contents</button>`;
  let at = 0;
  for (const group of groups) {
    const rows = group.slides.map((slide, position) => ({ slide, position, number: ++at }));
    tickHtml += rows
      .map(
        ({ slide, position, number }) =>
          `<button type="button" data-slide="${number}"${position === 0 && group !== groups[0] ? ' class="first"' : ''} aria-label="${attribute(slide.title)}" title="${attribute(slide.label)}" tabindex="-1"></button>`,
      )
      .join('');
    listHtml += `<section data-group="${groups.indexOf(group)}">${group.title ? `<h3>${group.title}</h3>` : ''}<ol>${rows.map(({ slide, number }) => `<li><button type="button" data-slide="${number}">${slide.label}</button></li>`).join('')}</ol></section>`;
  }

  const list = Object.assign(document.createElement('nav'), { id: `${page}List`, className: 'deck-list', innerHTML: listHtml });
  list.setAttribute('aria-label', `Slides of the ${title}`);
  const card = Object.assign(document.createElement('section'), {
    id: `${page}Card`,
    className: 'deck-card',
    tabIndex: -1,
    innerHTML: `
      <header class="deck-head">
        <h2 class="deck-title">${title}</h2>
        <span class="deck-position" id="${page}Position" aria-live="polite"></span>
        <button type="button" class="deck-close" id="${page}Close" aria-label="Close the ${title}">×</button>
      </header>
      <div class="deck-ticks" id="${page}Ticks" role="group" aria-label="Slides">${tickHtml}</div>
      <div class="deck-slides" id="${page}Slides"><div class="deck-track" id="${page}Track">${track}</div></div>
      <footer class="deck-foot">
        <button type="button" id="${page}Previous">Previous</button>
        <span class="deck-name" id="${page}Name"></span>
        <button type="button" id="${page}Next">Next</button>
      </footer>`,
  });
  card.dataset.deck = page;
  card.setAttribute('aria-label', title);
  card.setAttribute('aria-roledescription', 'carousel');
  list.dataset.deck = page;
  stage.append(list, card);
  window.dispatchEvent(new CustomEvent('f1:deck-made', { detail: { card, list } }));

  const $ = (suffix) => document.getElementById(`${page}${suffix}`);
  const trackNode = $('Track');
  const slideNodes = [...trackNode.children];
  const ticks = [...$('Ticks').children];
  const listButtons = [...list.querySelectorAll('button')];
  const listGroups = [...list.querySelectorAll('section')];
  let current = -1;

  /** Shows slide `at` (the track slides to it, at once when `animate` is false) and brings everything that says where we are up to date. */
  function go(at, { animate = true, announce = true } = {}) {
    const next = Math.max(0, Math.min(count - 1, at));
    if (next === current) return;
    const first = current < 0;
    current = next;
    trackNode.classList.toggle('still', first || !animate || reducedMotion.matches);
    trackNode.style.transform = `translateX(${-100 * next}%)`;
    slideNodes.forEach((node, position) => {
      node.inert = position !== next;
      node.setAttribute('aria-hidden', String(position !== next));
    });
    slideNodes[next].scrollTop = 0;
    // on a short screen the list scrolls: the slide shown stays in view
    const entry = listButtons.find((button) => Number(button.dataset.slide) === next);
    if (entry && list.clientHeight) {
      if (entry.offsetTop < list.scrollTop) list.scrollTop = Math.max(0, entry.offsetTop - 28);
      else if (entry.offsetTop + entry.offsetHeight > list.scrollTop + list.clientHeight)
        list.scrollTop = entry.offsetTop + entry.offsetHeight - list.clientHeight + 8;
    }
    ticks.forEach((tick, position) => tick.setAttribute('aria-current', String(position === next)));
    for (const button of listButtons) button.setAttribute('aria-current', String(Number(button.dataset.slide) === next));
    const group = next > 0 ? groups.findIndex((candidate) => candidate.slides.some((slide) => slide.id === idOf(next))) : -1;
    listGroups.forEach((section, position) => section.toggleAttribute('data-current', position === group));
    $('Position').textContent = `${next + 1} / ${count}`;
    $('Name').textContent = labels[next];
    $('Previous').disabled = next === 0;
    $('Next').disabled = next === count - 1;
    if (announce) window.dispatchEvent(new CustomEvent('f1:deck-slide', { detail: { page, id: idOf(next) } }));
  }

  /** A link in the text to an element (a part, a reference): the card goes to the slide it is on, and that slide scrolls to it. */
  function jump(id) {
    const target = document.getElementById(id);
    const slide = target?.closest('.deck-slide');
    if (!slide || !card.contains(slide)) return;
    go(slideNodes.indexOf(slide));
    const offset = target.getBoundingClientRect().top - slide.getBoundingClientRect().top + slide.scrollTop;
    slide.scrollTop = Math.max(0, offset - 12);
  }

  const reach = (event) => {
    const target = event.target.closest('[data-slide], [data-jump]');
    if (!target) return;
    if (target.dataset.jump) {
      event.preventDefault();
      jump(target.dataset.jump);
    } else go(Number(target.dataset.slide));
  };
  card.addEventListener('click', reach);
  list.addEventListener('click', reach);
  $('Previous').addEventListener('click', () => go(current - 1));
  $('Next').addEventListener('click', () => go(current + 1));
  $('Close').addEventListener('click', () => (location.hash = '#/'));

  // a swipe, with a finger (a mouse selects text and drags the scroll bar: it has the buttons and the keys)
  let swipe = null;
  $('Slides').addEventListener('pointerdown', (event) => {
    swipe = event.pointerType === 'touch' ? { x: event.clientX, y: event.clientY } : null;
  });
  $('Slides').addEventListener('pointerup', (event) => {
    if (!swipe) return;
    const [dx, dy] = [event.clientX - swipe.x, event.clientY - swipe.y];
    swipe = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 2 * Math.abs(dy)) go(current + (dx < 0 ? 1 : -1));
  });

  // the keys, while the page is shown (an open note takes its Escape first: it prevents the default)
  window.addEventListener('keydown', (event) => {
    if (document.body.dataset.page !== page || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
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

  // the slide in the address, when the page is shown (or the address changes); the card is shown only on its page
  const slideInAddress = () => {
    const id = new URLSearchParams(location.hash.split('?')[1] || '').get('slide');
    const found = entries.findIndex((entry) => entry.id === id);
    return found < 0 ? 0 : found + 1;
  };
  let shown = false;
  let wasOpen = false;
  window.addEventListener('f1:workspace-changed', () => {
    const open = document.body.dataset.page === page;
    card.toggleAttribute('data-open', open);
    list.toggleAttribute('data-open', open);
    if (!open) {
      wasOpen = false;
      return;
    }
    go(slideInAddress(), { animate: false, announce: false });
    if (!wasOpen) card.focus({ preventScroll: true });
    wasOpen = true;
    if (shown) return;
    shown = true;
    firstShown?.();
  });
  return { card, list, go };
}
