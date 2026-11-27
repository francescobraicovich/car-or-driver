// The questions on the front page, scrolling like the lines of a terminal: every few seconds a new question is typed in at the top, the others
// move down along a thread, and the oldest leaves at the bottom. The next question is drawn from the pool (question-pool.js), the more wanted ones
// more often and in a mix of kinds, never one about a topic already on the screen or shown lately. Each line is a link to the page that answers it. The feed shows only
// on the front page with nothing open, as many lines as fit (up to ten), waits while it is pointed at or holds the focus or the tab is hidden, and
// with reduced motion changes its lines without moving them. No storage, no requests beyond the Insights' data for the champions.
import { state } from './state.js';
import { drawQuestion, questionPool, questionsWithoutRatings } from './question-pool.js';

const MOST_LINES = 10;
const FEWEST_LINES = 4; // with less room than this the feed is not shown
const EVERY = 3200; // milliseconds between two questions
const RECENT = 40; // a topic shown among the last this many questions waits before it comes back
const TYPING = 22; // milliseconds a character of a new question takes to appear

/** @param {{random?: () => number}} [options] the number generator of the draws (tests pass a fixed one) */
export function initQuestionFeed({ random = Math.random } = {}) {
  const feed = document.getElementById('questionFeed');
  const list = document.getElementById('questionFeedList');
  const stage = document.getElementById('stage');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let pool = questionsWithoutRatings();
  const recent = [];
  let lines = 0;
  let timer = 0;
  let typing = 0;
  let finishTyping = () => {};
  let held = false; // pointed at, or the focus is in it

  const onScreen = () => new Set([...list.children].map((row) => row.dataset.topic));
  function next() {
    // (while the pool is small, before the ratings arrive, a recent topic may come back sooner)
    const kinds = [...list.children].map((row) => row.dataset.kind);
    const question =
      drawQuestion(pool, new Set([...onScreen(), ...recent]), random, kinds) ?? drawQuestion(pool, onScreen(), random, kinds);
    if (!question) return null;
    recent.push(question.topic);
    if (recent.length > RECENT) recent.shift();
    return question;
  }

  function row(question) {
    const item = document.createElement('li');
    item.className = 'feed-row';
    item.dataset.topic = question.topic;
    item.dataset.kind = question.kind;
    const link = document.createElement('a');
    link.className = 'feed-link';
    link.href = question.href;
    link.setAttribute('aria-label', question.text);
    const text = document.createElement('span');
    text.className = 'feed-text';
    text.setAttribute('aria-hidden', 'true');
    text.textContent = question.text;
    link.append(text);
    item.append(link);
    return item;
  }

  function depths() {
    [...list.children].forEach((item, depth) => item.style.setProperty('--depth', depth));
  }

  /** As many lines as the room holds: none when too few fit. */
  function measure() {
    const height = parseFloat(getComputedStyle(feed).getPropertyValue('--feed-line')) || 30;
    const fit = Math.min(MOST_LINES, Math.floor(feed.clientHeight / height));
    lines = fit >= FEWEST_LINES ? fit : 0;
    feed.style.setProperty('--feed-lines', lines);
    while (list.children.length > lines) list.lastElementChild.remove();
    while (list.children.length < lines) {
      const question = next();
      if (!question) break;
      list.append(row(question));
    }
    depths();
  }

  /** A new question at the top, typed in; the others move down a line and the last leaves. */
  function advance() {
    const question = next();
    if (!question || !lines) return;
    const item = row(question);
    list.prepend(item);
    while (list.children.length > lines + 1) list.lastElementChild.remove();
    depths();
    const leaving = list.children[lines];
    if (reducedMotion.matches) {
      leaving?.remove();
      return;
    }
    item.classList.add('arriving');
    leaving?.classList.add('leaving');
    item.addEventListener('animationend', () => leaving?.remove(), { once: true });
    const text = item.querySelector('.feed-text');
    const full = question.text;
    let shown = 0;
    text.textContent = '';
    finishTyping();
    finishTyping = () => {
      clearInterval(typing);
      text.textContent = full;
    };
    typing = setInterval(() => {
      shown += 1;
      text.textContent = full.slice(0, shown);
      if (shown >= full.length) finishTyping();
    }, TYPING);
  }

  /** The lines as they will be: the new one typed out, the leaving one gone. */
  function settle() {
    finishTyping();
    for (const item of list.querySelectorAll('.leaving')) item.remove();
    for (const item of list.querySelectorAll('.arriving')) item.classList.remove('arriving');
  }

  const shown = () => document.body.dataset.page === 'home' && stage.dataset.state === 'idle' && lines > 0;
  function run() {
    clearTimeout(timer);
    const visible = shown();
    feed.toggleAttribute('data-shown', visible); // (hidden by its visibility, so that its room can still be measured)
    feed.inert = !visible;
    if (!visible) settle(); // hidden, the feed does no work
    if (!visible || held || document.hidden) return;
    timer = setTimeout(() => {
      advance();
      run();
    }, EVERY);
  }

  list.addEventListener('pointerenter', () => {
    held = true;
    run();
  });
  list.addEventListener('pointerleave', () => {
    held = list.contains(document.activeElement);
    run();
  });
  list.addEventListener('focusin', () => {
    held = true;
    run();
  });
  list.addEventListener('focusout', (event) => {
    held = list.contains(event.relatedTarget) || list.matches(':hover');
    run();
  });
  document.addEventListener('visibilitychange', run);
  window.addEventListener('f1:workspace-changed', () => setTimeout(run)); // (after the stage has taken its state for the page)
  new MutationObserver(run).observe(stage, { attributes: true, attributeFilter: ['data-state'] });
  new ResizeObserver(() => {
    measure();
    run();
  }).observe(feed);
  window.addEventListener('f1:model-ready', async () => {
    const { INSIGHTS_DATA } = await import('./insights-data.js'); // the points leader of each season: a driver's titles
    pool = questionPool(state.displayModel, state.profiles, INSIGHTS_DATA.champions);
  });
  measure();
  run();
}
