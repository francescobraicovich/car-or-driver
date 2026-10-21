// Ratings view: a ranked lollipop chart (or table) for one race weekend, with a
// season/Grand Prix picker and a play/scrub timeline over every weekend.
import { state } from './state.js';
import { el } from './dom.js';
import { esc } from './utils.js';
import { clamp } from '../../packages/core/src/math.js';
import { metricLabel, metricValue } from './charts.js';
import { barScale, barShare } from './ratings-bars.js';
import { DESCRIPTIONS, NAMES, isProbability } from './metric-text.js';

// Recent form adjusts the race-pace ratings only.
const FORM_METRICS = ['combined', 'race'];

const preferences = {
  driver: { metric: 'combined', selected: new Set() },
  car: { metric: 'combined', selected: new Set() },
};
let entity = 'driver';
let formOn = false;
let showSd = true;
let ratingDecimals = 1;
// One standard deviation of each rating (state-space model). Combined pace mixes the race and qualifying filters (the race filter reads the qualifying one, so the bar is slightly understated).
const SD_FIELD = { race: 'raceSd', qual: 'qualSd', combined: 'combinedSd' };
const sdOf = (row, metric) => {
  const v = row[SD_FIELD[metric]];
  return Number.isFinite(v) ? v : NaN;
};
// History shows at most this many lines at once, so no more entries than that can be selected for comparison.
const MAX_SELECTED = 8;
let panel;
let controls;
let panelWidth = 0;
let timer = null;
let scrubbing = false; // the weekend slider is being dragged
// the weekends are going by: the row under a still pointer has changed under it, so no card, and the race on the page is not rebuilt for each weekend
const busy = () => Boolean(timer) || scrubbing;

const PLAY_PATH = 'M3 1.5v13l11-6.5z';
const PAUSE_PATH = 'M3 1.5h3.5v13H3zM9.5 1.5H13v13H9.5z';
const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });

export function ratingRows(model, index, type, metric) {
  const snap = model?.snaps[index];
  if (!snap) return [];
  const key = type === 'car' ? 'constructorId' : 'driverId';
  const history = type === 'car' ? model.ch : model.dh;
  return (type === 'car' ? snap.cars : snap.drivers)
    .map((row) => {
      const id = String(row[key]);
      const earlier = (history.get(id) || []).filter(
        (point) => point.year < snap.year || (point.year === snap.year && point.round < snap.round),
      );
      const previous = earlier.at(-1) ?? null;
      const value = metricValue(row, metric, type);
      const before = previous ? metricValue(previous, metric, type) : NaN;
      return { ...row, id, value, previous, change: Number.isFinite(value) && Number.isFinite(before) ? value - before : NaN };
    })
    .sort((a, b) => {
      const av = Number.isFinite(a.value) ? a.value : -Infinity;
      const bv = Number.isFinite(b.value) ? b.value : -Infinity;
      return (av === bv ? 0 : bv - av) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    })
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

const currentIndex = () => state.raceIndex;

/** Show weekend `i` (clamped to the modelled weekends). A change the user made is announced, so the workspace can put it in the URL. */
export function setRace(i, { announce = true } = {}) {
  const n = state.model?.snaps.length || 0;
  if (!n) return;
  state.raceIndex = clamp(Number.isFinite(+i) ? Math.round(+i) : n - 1, 0, n - 1);
  renderRatings();
  if (!announce) return;
  const snap = state.model.snaps[state.raceIndex];
  window.dispatchEvent(new CustomEvent('f1:race-changed', { detail: { index: state.raceIndex, raceId: snap.raceId, date: snap.date } }));
}

/** Show the drivers or the cars. */
export function setEntity(next) {
  if (next === entity || !['driver', 'car'].includes(next)) return;
  stop();
  entity = next;
  renderRatings();
}

/** After a build: reveal the ratings and history panels and show the latest weekend. */
export function populate() {
  el.ratingsHost.hidden = false;
  el.chartsPanel.hidden = false;
  setRace(state.model.snaps.length - 1, { announce: false });
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  scheduleSettle();
  if (controls) {
    controls.ratingsPlay.setAttribute('aria-label', 'Play through the weekends');
    controls.ratingsPlay.firstElementChild.firstElementChild.setAttribute('d', PLAY_PATH);
  }
}

function play() {
  const last = (state.model?.snaps.length || 1) - 1;
  if (currentIndex() >= last) setRace(0);
  controls.ratingsPlay.setAttribute('aria-label', 'Pause');
  controls.ratingsPlay.firstElementChild.firstElementChild.setAttribute('d', PAUSE_PATH);
  timer = setInterval(() => {
    if (!panel.offsetParent || currentIndex() >= last) return stop();
    setRace(currentIndex() + 1);
  }, 90);
}

function ensurePanel() {
  if (panel) return;
  panel = document.createElement('figure');
  panel.id = 'ratingsPanel';
  panel.className = 'frame';
  panel.innerHTML = `
    <header class="frame-head">
      <h2 class="frame-title sr-only" id="ratingsTitle"></h2>
      <div class="segmented" role="group" aria-label="Show">
        <button type="button" id="ratingsDrivers" aria-pressed="true">Drivers</button>
        <button type="button" id="ratingsCars" aria-pressed="false">Cars</button>
      </div>
      <div class="timeline-pickers">
        <label class="field"><span class="sr-only">Season</span><select id="ratingsSeason"></select></label>
        <label class="field"><span class="sr-only">Grand Prix</span><select id="ratingsGp"></select></label>
      </div>
    </header>
    <div class="frame-tools">
      <label class="field"><span class="sr-only">Rating</span><select id="ratingsMetric"></select></label>
      <button type="button" class="toggle" id="ratingsLayerForm" aria-pressed="false">form</button>
      <button type="button" class="toggle" id="ratingsSd" aria-pressed="true" aria-label="Uncertainty">±</button>
    </div>
    <ol class="ratings-list" id="ratingsList"></ol>
    <div class="selection-bar" id="ratingsSelection" role="region" aria-label="Selected for comparison" hidden>
      <p class="selection-names" id="ratingsSelectionNames"></p>
      <div class="selection-actions">
        <button type="button" id="ratingsCompareHistory" class="btn-primary">Compare in history</button>
        <button type="button" id="ratingsCompareHeadToHead">Head to head</button>
        <button type="button" id="ratingsClearSelection" class="btn-quiet">Clear</button>
      </div>
    </div>
    <div class="frame-dock">
      <div class="timeline">
        <button type="button" class="play" id="ratingsPlay" aria-label="Play through the weekends"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${PLAY_PATH}"/></svg></button>
        <div class="scrub"><input type="range" id="ratingsScrub" min="0" max="0" value="0" step="1" aria-label="Race weekend" /></div>
        <time class="scrub-now" id="ratingsNow"></time>
      </div>
    </div>
    <footer class="frame-foot">
      <span class="notes">CC BY-NC-SA 4.0 · <a href="#/about">credits</a></span>
    </footer>`;
  el.ratingsHost.append(panel);
  controls = Object.fromEntries([...panel.querySelectorAll('[id]')].map((n) => [n.id, n]));

  for (const [id, which] of [
    ['ratingsDrivers', 'driver'],
    ['ratingsCars', 'car'],
  ]) {
    controls[id].addEventListener('click', () => {
      setEntity(which);
      window.dispatchEvent(new CustomEvent('f1:entity-chosen', { detail: { entity: which } })); // the picture follows what the panel shows
    });
  }
  controls.ratingsMetric.addEventListener('change', () => {
    preferences[entity].metric = controls.ratingsMetric.value;
    renderRatings();
  });
  controls.ratingsLayerForm.addEventListener('click', () => {
    formOn = !formOn;
    renderRatings();
  });
  controls.ratingsSd.addEventListener('click', () => {
    showSd = !showSd;
    renderRatings();
  });
  controls.ratingsPlay.addEventListener('click', () => (timer ? stop() : play()));
  controls.ratingsScrub.addEventListener('pointerdown', () => {
    stop();
    scrubbing = true;
    const end = () => {
      scrubbing = false;
      scheduleSettle();
    };
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', end, { once: true });
  });
  controls.ratingsScrub.addEventListener('input', () => setRace(+controls.ratingsScrub.value));
  controls.ratingsSeason.addEventListener('change', () => {
    stop();
    const last = state.model.snaps.map((s) => s.year).lastIndexOf(+controls.ratingsSeason.value);
    if (last >= 0) setRace(last);
  });
  controls.ratingsGp.addEventListener('change', () => {
    stop();
    setRace(+controls.ratingsGp.value);
  });
  controls.ratingsCompareHistory.addEventListener('click', () => {
    const ids = [...preferences[entity].selected];
    if (ids.length)
      window.dispatchEvent(new CustomEvent('f1:compare-history', { detail: { entity, ids, metric: preferences[entity].metric } }));
  });
  controls.ratingsCompareHeadToHead.addEventListener('click', () => {
    const ids = [...preferences.driver.selected];
    if (entity === 'driver' && ids.length === 2) window.dispatchEvent(new CustomEvent('f1:compare-head-to-head', { detail: { ids } }));
  });
  controls.ratingsClearSelection.addEventListener('click', () => {
    preferences[entity].selected.clear();
    renderRatings();
  });
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      const width = Math.round(panel.getBoundingClientRect().width);
      if (width > 0 && width !== panelWidth) {
        panelWidth = width;
        renderRatings();
      }
    }).observe(panel);
  }
  window.addEventListener('f1:track-hover', (event) => {
    linked = { driver: event.detail.driver, team: event.detail.team };
    for (const line of controls.ratingsList.querySelectorAll('.ledger-row')) line.classList.toggle('linked', isLinked(line.dataset.id));
  });
  window.addEventListener('f1:workspace-changed', () => {
    stop();
    // The panel has no width while its page is hidden, so a first draw made then is the wrong size.
    if (panel.offsetParent) renderRatings();
  });
}

// A rating with a standard deviation of several points is shown without decimals: they would claim precision it does not have.
const fmt = (value, probability) =>
  Number.isFinite(value) ? `${value.toFixed(probability ? 1 : ratingDecimals)}${probability ? '%' : ''}` : '—';
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;

function changeParts(row, probability) {
  if (!row.previous) return { text: 'New', tone: '' };
  if (!Number.isFinite(row.change)) return { text: '—', tone: '' };
  const v = Number(row.change.toFixed(1));
  if (v === 0) return { text: '0.0', tone: '' };
  return { text: `${v > 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}${probability ? ' pp' : ''}`, tone: v > 0 ? 'var(--pos)' : 'var(--neg)' };
}

/** What the last column of a row says, in as few characters as it can: the shift from recent form when that is on, otherwise the change since the previous appearance. */
function lastColumn(row, probability, showForm) {
  if (showForm) {
    const v = Number((row.shift ?? 0).toFixed(1));
    return v === 0 ? { text: '', tone: '' } : { text: `${v > 0 ? '▲' : '▼'}${Math.abs(v).toFixed(1)}`, tone: v > 0 ? 'up' : 'down' };
  }
  const { text } = changeParts(row, probability);
  const tone = text.startsWith('▲') ? 'up' : text.startsWith('▼') ? 'down' : ''; // a class, not an inline colour: an inline colour would stay on the inverted row
  return { text: text === '0.0' ? '' : text === 'New' ? 'new' : text.replace(/([▲▼]) /, '$1').replace(' pp', 'pp'), tone };
}

/**
 * Whether recent form is on. "With recent form" adds the forecast model's form shift to the pace rating, which only exists for drivers, for
 * combined or race pace, on the latest weekend; otherwise it is unavailable and the rating is shown.
 */
function layerState(pref) {
  let reason = '';
  if (entity !== 'driver') reason = 'Recent form is only shown for drivers.';
  else if (!FORM_METRICS.includes(pref.metric)) reason = 'Recent form applies to Combined and Race pace.';
  else if (currentIndex() !== state.model.snaps.length - 1) reason = 'Recent form is only shown for the latest weekend.';
  const shifts = reason ? null : state.model.formShifts;
  if (!reason && !shifts) reason = 'Recent form is not available for this model.';
  return { shifts, reason, showForm: formOn && !reason, sd: false };
}

/** Rows ranked by what is being shown: with recent form, the form-adjusted value. */
function withForm(rows, st) {
  if (!st.showForm) return rows;
  return rows
    .map((row) => {
      const shift = st.shifts.get(row.id) ?? 0;
      return { ...row, shift, formValue: row.value + shift };
    })
    .sort((a, b) => b.formValue - a.formValue || a.name.localeCompare(b.name))
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

function description(row, snap, metric, probability, st) {
  const change = changeParts(row, probability).text;
  const lines = [
    `${row.name}${entity === 'driver' && row.car ? ` · ${row.car}` : ''}`,
    `Rank ${row.rank} · ${NAMES[metric] || metricLabel(metric)}: ${fmt(row.value, probability)}`,
  ];
  if (row.newDriver) lines.push(`New driver: ${row.races} race${row.races === 1 ? '' : 's'} so far, so the rating is provisional`);
  if (Number.isFinite(sdOf(row, metric)))
    lines.push(`Uncertainty: ± ${sdOf(row, metric).toFixed(0)} points (one standard deviation, approximate)`);
  if (st.showForm) lines.push(`With recent form: ${fmt(row.formValue, probability)} (${signed(row.shift)} from form)`);
  lines.push(`Change since previous appearance: ${change}`, `${snap.year} ${snap.name}`);
  return lines.join('\n');
}

function toggleSelected(row) {
  const selected = preferences[entity].selected;
  if (selected.has(row.id)) selected.delete(row.id);
  else if (selected.size < MAX_SELECTED) selected.add(row.id);
  renderRatings();
  const item = rowElements.get(`${entity}:${row.id}`);
  if (item?._parts.line.matches(':hover, :focus')) item._parts.point(); // the card was put away with the redraw: the row still under the pointer shows it again
}

const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const rowElements = new Map(); // `${entity}:${id}` -> its <li>, kept from one weekend to the next, so that it can glide to its new place and its bar can grow
let widest = null; // the widest names seen while the weekends go by, so that the columns (and with them the length of every bar) do not change from one weekend to the next
let settling = null;

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** One row of the list, empty: it is made once for a driver (or a team) and filled in again for every weekend (fillRow), so that it can move and its bar can grow. */
function createRow() {
  const item = document.createElement('li');
  const line = element('div', 'ledger-row');
  const bar = element('span', 'bar');
  bar.setAttribute('aria-hidden', 'true');
  const base = element('i', 'bar-base');
  bar.append(element('i', 'bar-track'), base);
  const cells = Object.fromEntries(['rank', 'name', 'team', 'rating', 'deviation', 'change'].map((name) => [name, element('span', name)]));
  line.append(cells.rank, cells.name, cells.team, cells.rating, cells.deviation, bar, cells.change);
  // the row is a button for the keyboard and for screen readers (which are told the rating as a sentence); the card is for the eye
  line.tabIndex = 0;
  line.setAttribute('role', 'button');
  const point = () => {
    if (busy()) return;
    const { row, snap } = item._data;
    showCard(row, line, snap);
    announceRow(row.id); // the dot of this row on the track turns red
  };
  line.addEventListener('click', () => toggleSelected(item._data.row));
  line.addEventListener('pointerenter', point);
  line.addEventListener('focus', point);
  line.addEventListener('pointerleave', hideCard);
  line.addEventListener('blur', hideCard);
  line.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleSelected(item._data.row);
    }
  });
  item.append(line);
  item._parts = { line, bar, base, cells, form: null, point };
  return item;
}

/** What a row says for a weekend: the text, the classes, and the bar (blue to the rating, with the form stacked on it in FA1802). */
function fillRow(item, row, index, { snap, metric, probability, st, share, low, high, names, teams, selected }) {
  item._data = { row, snap };
  const { line, bar, base, cells } = item._parts;
  item.style.order = String(index); // where the row is on the screen; the order in the document follows once the rows have glided (settle)
  line.dataset.id = row.id;
  line.classList.toggle('selected', selected.has(row.id));
  line.classList.toggle('linked', isLinked(row.id));
  line.setAttribute('aria-pressed', String(selected.has(row.id)));
  line.setAttribute('aria-label', description(row, snap, metric, probability, st));
  const last = lastColumn(row, probability, st.showForm);
  cells.rank.textContent = row.rank;
  cells.name.textContent = names[index];
  cells.team.textContent = teams[index];
  cells.rating.textContent = fmt(st.showForm ? row.formValue : row.value, probability);
  cells.deviation.textContent = Number.isFinite(sdOf(row, metric)) ? `±${sdOf(row, metric).toFixed(0)}` : '';
  cells.change.className = `change ${last.tone}`.trim();
  cells.change.textContent = last.text;
  const from = st.showForm ? Math.min(row.value, row.formValue) : row.value;
  base.style.width = share(from);
  if (st.showForm && row.shift) {
    const form = (item._parts.form ??= bar.appendChild(element('i', 'bar-form')));
    form.classList.toggle('loss', row.shift < 0);
    form.style.left = share(from);
    form.style.width = `${(100 * (barShare(Math.max(row.value, row.formValue), low, high) - barShare(from, low, high))).toFixed(2)}%`;
  } else if (item._parts.form) {
    item._parts.form.remove();
    item._parts.form = null;
  }
}

/**
 * The ratings, ranked, as rows: rank, name (and team when there is room), rating, error, a bar, and the last column. The bar runs from the left to
 * the rating, in blue; with recent form on, the shift is stacked on it in FA1802 (solid where form adds to the rating, an outline where it takes
 * away from it). A vertical line marks the average, 1,000 on the rating scale, or the mean of what is shown for the probabilities.
 *
 * The rows stay from one weekend to the next (and from one rating to another): when the places change they glide to their new ones, the bars grow or
 * shrink, the average line moves, a driver who joins fades in and one who leaves is gone. The glide is FLIP: where each row is now is measured, the
 * rows are put in their new places, and each is moved back to where it was and let go. A row is put in its place on the screen with the CSS `order`;
 * the order in the document (for the keyboard and for screen readers) follows once the rows have glided, because moving a node in the document cancels
 * what it is doing. With reduced motion nothing glides.
 */
function drawList(rows, snap, metric, probability, st) {
  const list = controls.ratingsList;
  const selected = preferences[entity].selected;
  const width = panel.getBoundingClientRect().width;
  const finite = rows.map((row) => row.value).filter(Number.isFinite);
  const mean = probability ? finite.reduce((sum, value) => sum + value, 0) / (finite.length || 1) : 1000;
  const { low, high } = barScale([...rows.flatMap((row) => (st.showForm ? [row.value, row.formValue] : [row.value])), mean]);
  const share = (value) => `${(100 * barShare(value, low, high)).toFixed(2)}%`;
  const names = rows.map((row) => (row.newDriver ? `${row.name} · new` : row.name));
  const teams = rows.map((row) => (entity === 'driver' ? row.car || '' : ''));
  const showTeam = entity === 'driver' && width >= 560;
  // the name column is as wide as the longest name (up to a limit), so that the ratings are close to the names and the bars take the rest; while the
  // weekends go by it is as wide as the longest name seen so far, so that it does not change from one weekend to the next
  const longest = { name: Math.max(...names.map((name) => name.length), 4), team: Math.max(...teams.map((team) => team.length), 4) };
  widest = busy() ? { name: Math.max(widest?.name ?? 0, longest.name), team: Math.max(widest?.team ?? 0, longest.team) } : null;
  const columns = widest ?? longest;
  list.style.setProperty('--rows', String(rows.length));
  list.style.setProperty('--name', `${Math.min(columns.name, width >= 560 ? 22 : 18)}ch`);
  list.style.setProperty('--team', `${Math.min(columns.team, 16)}ch`);
  list.style.setProperty('--mean', share(mean));
  list.classList.toggle('with-team', showTeam);
  list.classList.toggle('with-sd', st.sd && width >= 400); // a phone has no room for the error beside every rating
  list.setAttribute(
    'aria-label',
    `${entity === 'driver' ? 'Driver' : 'Car'} ratings, ${NAMES[metric] || metric}${st.showForm ? ', with recent form' : ''}, ranked. Press a row to select it for comparison.`,
  );
  if (!rows.length) {
    rowElements.clear();
    list.replaceChildren(document.createTextNode('No entries for this weekend.'));
    return;
  }
  if (list.firstChild?.nodeType === Node.TEXT_NODE) list.firstChild.remove();
  const keys = rows.map((row) => `${entity}:${row.id}`);
  // rows that glide: those that were there already (the other drivers or cars, when the entity has just changed, are not the same rows)
  const glide = !reducedMotion.matches && keys.some((key) => rowElements.has(key)) && list.offsetParent !== null;
  const before = new Map(); // where each row is now, with whatever it is still gliding by
  if (glide)
    for (const [key, item] of rowElements) {
      before.set(key, item.getBoundingClientRect().top);
      item.style.transition = 'none';
      item.style.transform = 'none';
    }
  const context = { snap, metric, probability, st, share, low, high, names, teams, selected };
  const entering = [];
  rows.forEach((row, index) => {
    let item = rowElements.get(keys[index]);
    if (!item) {
      item = createRow();
      rowElements.set(keys[index], item);
      list.append(item);
      if (glide) {
        item.classList.add('entering');
        entering.push(item);
      }
    }
    fillRow(item, row, index, context);
  });
  for (const [key, item] of rowElements)
    if (!keys.includes(key)) {
      item.remove();
      rowElements.delete(key);
    }
  if (glide) {
    const moved = [];
    for (const [key, top] of before) {
      const item = rowElements.get(key);
      if (!item) continue;
      const delta = top - item.getBoundingClientRect().top;
      if (Math.abs(delta) > 0.5) item.style.transform = `translateY(${delta}px)`; // back to where it was
      moved.push(item);
    }
    void list.offsetHeight;
    for (const item of moved) {
      item.style.transition = '';
      item.style.transform = ''; // and let go
    }
    for (const item of entering) item.classList.remove('entering');
    scheduleSettle();
  } else settle(true);
}

function scheduleSettle() {
  clearTimeout(settling);
  settling = setTimeout(settle, 340);
}

/** Puts the rows in the document in the order they have on the screen (for the keyboard and for screen readers), once nothing is moving. */
function settle(force = false) {
  clearTimeout(settling);
  const list = controls?.ratingsList;
  if (!list || (busy() && !force)) return;
  const ordered = [...list.children]
    .filter((child) => child.tagName === 'LI')
    .sort((a, b) => Number(a.style.order) - Number(b.style.order));
  if (ordered.every((item, index) => list.children[index] === item)) return;
  const focused = list.contains(document.activeElement) ? document.activeElement : null; // moving a node in the document drops the focus
  list.append(...ordered);
  focused?.focus({ preventScroll: true });
}

let card;
let linked = { driver: null, team: null }; // the driver (and the team) under the pointer in the timing table of the race

/** Whether a row of the ratings is the driver, or the team, that is being pointed at in the timing table. */
const isLinked = (id) => (entity === 'driver' ? id === linked.driver : id === linked.team);

/** The card beside the panel for the row under the pointer: who, how old, which team, the rank and the paces. It is drawn in the panel's own style. */
function showCard(row, target, snap) {
  const stage = panel.closest('.stage');
  if (!card) {
    card = document.createElement('div');
    card.id = 'ratingCard';
    card.className = 'rating-card';
    card.hidden = true;
    card.setAttribute('aria-hidden', 'true');
    stage.append(card);
  }
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const isDriver = entity === 'driver';
  const profile = isDriver ? state.profiles?.[row.id] : undefined; // a team's id can be the id of some driver
  const [forename, surname] = profile ?? [row.name.split(' ').slice(0, -1).join(' '), row.name.split(' ').at(-1)];
  const heading = element('p', 'card-name');
  if (isDriver && forename) heading.append(element('span', 'card-forename', forename), element('span', 'card-surname', surname));
  else heading.append(element('span', 'card-surname', row.name));
  // the age on the day of the weekend, from the month of birth only: the birthday is taken to fall in the middle of its month
  const [bornYear, bornMonth] = profile?.[2] ? profile[2].split('-').map(Number) : []; // (an empty month of birth is not the year 0)
  const on = new Date(snap.date);
  const age = Number.isFinite(bornYear)
    ? on.getUTCFullYear() -
      bornYear -
      (on.getUTCMonth() + 1 < bornMonth || (on.getUTCMonth() + 1 === bornMonth && on.getUTCDate() < 15) ? 1 : 0)
    : NaN;
  const facts = [isDriver ? row.car : '', Number.isFinite(age) ? `age ${age}` : ''].filter(Boolean);
  const grid = element('dl', 'card-grid');
  const add = (label, value, note) => {
    const number = element('dd', 'card-value', value);
    if (note) number.append(element('small', note.tone ?? '', note.text));
    grid.append(element('dt', '', label), number);
  };
  const sd = (value) => (Number.isFinite(value) ? { text: ` ±${Math.round(value)}` } : null);
  add('Rank', String(row.rank));
  add('Pace', fmt(row.combined, false), sd(row.combinedSd));
  add('Quali pace', fmt(row.qual, false), sd(row.qualSd));
  const shift = isDriver && currentIndex() === state.model.snaps.length - 1 ? state.model.formShifts?.get(row.id) : undefined;
  if (Number.isFinite(shift) && Number.isFinite(row.combined))
    add('Pace with form', fmt(row.combined + shift, false), {
      text: ` ${shift >= 0 ? '▲' : '▼'}${Math.abs(shift).toFixed(1)}`,
      tone: shift >= 0 ? 'up' : 'down',
    });
  card.replaceChildren(heading, ...(facts.length ? [element('p', 'card-facts', facts.join(' · '))] : []), grid);
  // beside the panel, level with the row, on a wide screen; under the row (or over it, near the bottom) on a narrow one
  card.hidden = false;
  const box = stage.getBoundingClientRect();
  const at = target.getBoundingClientRect();
  const side = panel.getBoundingClientRect();
  const wide = stage.dataset.layout === 'wide';
  let left = wide ? side.right + 12 : side.left + 8;
  let top = wide ? at.top - 8 : at.bottom + 6;
  if (!wide && top + card.offsetHeight > box.bottom - 8) top = at.top - card.offsetHeight - 6;
  top = Math.max(box.top + 8, Math.min(top, box.bottom - card.offsetHeight - 8));
  left = Math.max(box.left + 8, Math.min(left, box.right - card.offsetWidth - 8));
  card.style.left = `${left - box.left}px`;
  card.style.top = `${top - box.top}px`;
}

function hideCard() {
  if (card) card.hidden = true;
  announceRow(null);
}

/** Tells the track on the page (track-view.js) which row is under the pointer or has the focus, or none. */
function announceRow(id) {
  window.dispatchEvent(new CustomEvent('f1:row-hover', { detail: { id } }));
}

function updateSelection() {
  const names = new Map(ratingRows(state.model, currentIndex(), entity, preferences[entity].metric).map((row) => [row.id, row.name]));
  const chosen = [...preferences[entity].selected].filter((id) => names.has(id));
  controls.ratingsSelection.hidden = chosen.length === 0;
  controls.ratingsSelectionNames.textContent = chosen.length
    ? `${chosen.length} selected: ${chosen.map((id) => names.get(id)).join(', ')}`
    : '';
  controls.ratingsCompareHeadToHead.hidden = entity !== 'driver';
  controls.ratingsCompareHeadToHead.disabled = chosen.length !== 2;
  controls.ratingsCompareHeadToHead.title = chosen.length === 2 ? '' : 'Select exactly two drivers to forecast their race';
}

function syncTimeline(snap) {
  const snaps = state.model.snaps;
  const n = snaps.length;
  const index = currentIndex();
  const { ratingsScrub: scrub } = controls;
  if (+scrub.max !== n - 1) scrub.max = String(n - 1);
  scrub.value = String(index);
  controls.ratingsNow.textContent = dateFormat.format(Date.parse(snap.date));
  controls.ratingsNow.dateTime = snap.date;
  scrub.setAttribute('aria-valuetext', `${snap.year} ${snap.name}`);
  const years = [...new Set(snaps.map((s) => s.year))];
  if (controls.ratingsSeason.options.length !== years.length)
    controls.ratingsSeason.replaceChildren(...years.map((y) => new Option(String(y), String(y))));
  controls.ratingsSeason.value = String(snap.year);
  const inSeason = snaps.map((s, i) => [s, i]).filter(([s]) => s.year === snap.year);
  controls.ratingsGp.replaceChildren(
    ...inSeason.map(([s, i]) => new Option(`R${s.round} · ${s.name.replace(/ Grand Prix$/, ' GP')}`, String(i))),
  );
  controls.ratingsGp.value = String(index);
}

export function renderRatings() {
  if (!el.ratingsHost) return;
  ensurePanel();
  const pref = preferences[entity];
  const metrics = ['combined', 'race', 'qual', 'effective', entity === 'driver' ? 'clean' : 'survival'];
  controls.ratingsMetric.innerHTML = metrics
    .map((m) => `<option value="${m}"${m === pref.metric ? ' selected' : ''}>${esc(NAMES[m])}</option>`)
    .join('');
  for (const [id, on] of [
    ['ratingsDrivers', entity === 'driver'],
    ['ratingsCars', entity === 'car'],
  ])
    controls[id].setAttribute('aria-pressed', String(on));
  const snap = state.model?.snaps[currentIndex()];
  if (!snap) {
    controls.ratingsTitle.textContent = 'Ratings';
    rowElements.clear();
    controls.ratingsList.replaceChildren();
    return;
  }
  const st = layerState(pref);
  const baseRows = ratingRows(state.model, currentIndex(), entity, pref.metric);
  const hasSd = baseRows.some((r) => Number.isFinite(sdOf(r, pref.metric)));
  ratingDecimals = hasSd ? 0 : 1;
  st.sd = showSd && hasSd;
  controls.ratingsSd.setAttribute('aria-pressed', String(st.sd));
  controls.ratingsSd.toggleAttribute('disabled', !hasSd);
  controls.ratingsSd.hidden = panel.getBoundingClientRect().width < 400; // a phone has no room for the error beside every rating
  controls.ratingsSd.title = hasSd ? 'Show one standard deviation of each rating' : 'This rating has no uncertainty estimate';
  const rows = withForm(baseRows, st);
  const probability = isProbability(pref.metric);
  controls.ratingsLayerForm.setAttribute('aria-pressed', String(st.showForm));
  controls.ratingsLayerForm.toggleAttribute('disabled', Boolean(st.reason));
  controls.ratingsLayerForm.title = st.reason || 'Add the recent form of each driver to the rating';
  controls.ratingsMetric.title = DESCRIPTIONS[pref.metric];
  // the weekend is in the pickers beside the title, so only a screen reader is told it twice
  controls.ratingsTitle.innerHTML = `${entity === 'driver' ? 'Driver' : 'Car'} ratings<span class="sr-only"> after the ${esc(`${snap.year} ${snap.name}`)}</span>`;
  hideCard();
  drawList(rows, snap, pref.metric, probability, st);
  syncTimeline(snap);
  updateSelection();
  // the weekend shown, for the track on the page
  window.dispatchEvent(
    new CustomEvent('f1:ratings-drawn', {
      detail: {
        entity,
        busy: busy(),
        snap: { raceId: String(snap.raceId), year: snap.year, name: snap.name, circuitId: String(snap.circuitId) },
      },
    }),
  );
}
