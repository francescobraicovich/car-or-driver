// Ratings view: a ranked lollipop chart (or table) for one race weekend, with a
// season/Grand Prix picker and a play/scrub timeline over every weekend.
import { state } from './state.js';
import { el } from './dom.js';
import { esc } from './utils.js';
import { clamp } from '../../packages/core/src/math.js';
import { exportCSV } from './export.js';
import { metricLabel, metricValue } from './charts.js';
import { hideTooltip, inspectTarget } from './chart-renderer.js';
import { bar, barScale } from './ratings-bars.js';
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
      <button type="button" id="ratingsExport" class="btn-quiet">Download CSV</button>
      <button type="button" id="ratingsShare" class="btn-quiet">Copy link</button>
      <span class="notes" id="ratingsShareStatus" role="status"></span>
      <span class="notes">CC BY-NC-SA 4.0 · <a href="#/about">credits</a></span>
      <details class="notes-more"><summary>About these numbers</summary><p class="notes" id="ratingsNote"></p></details>
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
  controls.ratingsScrub.addEventListener('pointerdown', stop);
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
  controls.ratingsExport.addEventListener('click', exportCSV);
  controls.ratingsShare.addEventListener('click', () => window.dispatchEvent(new CustomEvent('f1:share-requested')));
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
  controls.ratingsList.querySelector(`[data-id="${CSS.escape(row.id)}"]`)?.focus(); // the rows are drawn again: the one pressed keeps the focus
}

/** The ratings, ranked, as rows: rank, name (and team when there is room), rating, error, a bar of block characters, and the last column. */
function drawList(rows, snap, metric, probability, st) {
  const list = controls.ratingsList;
  const selected = preferences[entity].selected;
  const width = panel.getBoundingClientRect().width;
  const barWidth = width < 400 ? 9 : 14;
  const shown = (row) => (st.showForm ? row.formValue : row.value);
  const { low, high } = barScale(rows.map(shown));
  list.style.setProperty('--rows', String(rows.length));
  list.style.setProperty('--bar', String(barWidth));
  list.classList.toggle('with-team', entity === 'driver' && width >= 560);
  list.classList.toggle('with-sd', st.sd && width >= 400); // a phone has no room for the error beside every rating
  list.setAttribute(
    'aria-label',
    `${entity === 'driver' ? 'Driver' : 'Car'} ratings, ${NAMES[metric] || metric}${st.showForm ? ', with recent form' : ''}, ranked. Press a row to select it for comparison.`,
  );
  const cell = (className, text) => {
    const node = document.createElement('span');
    node.className = className;
    node.textContent = text;
    return node;
  };
  list.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement('li');
      const line = document.createElement('div');
      line.className = 'ledger-row';
      line.dataset.id = row.id;
      line.classList.toggle('selected', selected.has(row.id));
      line.setAttribute('aria-pressed', String(selected.has(row.id)));
      const last = lastColumn(row, probability, st.showForm);
      const change = cell(`change ${last.tone}`.trim(), last.text);
      const deviation = Number.isFinite(sdOf(row, metric)) ? `±${sdOf(row, metric).toFixed(0)}` : '';
      line.append(
        cell('rank', row.rank),
        cell('name', row.newDriver ? `${row.name} · new` : row.name),
        cell('team', entity === 'driver' ? row.car || '' : ''),
        cell('rating', fmt(shown(row), probability)),
        cell('deviation', deviation),
        cell('bar', bar(shown(row), low, high, barWidth)),
        change,
      );
      for (const decoration of line.querySelectorAll('.bar')) decoration.setAttribute('aria-hidden', 'true');
      line.addEventListener('click', () => toggleSelected(row));
      inspectTarget(
        line,
        () => description(row, snap, metric, probability, st),
        (key) => {
          if (key === 'Enter' || key === ' ') toggleSelected(row);
        },
        // beside the panel, level with the row, where there is room for that (a column on a wide screen); otherwise by the pointer
        panel.closest('.stage')?.dataset.layout === 'wide'
          ? (target) => ({ x: panel.getBoundingClientRect().right, y: target.getBoundingClientRect().top - 14 })
          : undefined,
      );
      item.append(line);
      return item;
    }),
  );
  if (!rows.length) list.textContent = 'No entries for this weekend.';
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
  const latest = state.model.snaps[state.model.snaps.length - 1];
  const isLatest = String(snap.raceId) === String(latest.raceId);
  // the weekend is in the pickers beside the title, so only a screen reader is told it twice
  controls.ratingsTitle.innerHTML = `${entity === 'driver' ? 'Driver' : 'Car'} ratings<span class="sr-only"> after the ${esc(`${snap.year} ${snap.name}`)}</span>`;
  const formNote = st.showForm
    ? ' With recent form is the rating plus the forecast model’s adjustment for the last few races, in rating points, relative to the teammate; the last column is that shift.'
    : st.reason && formOn
      ? ` ${st.reason}`
      : ' The last column is the change since the previous appearance.';
  const sdNote = st.sd
    ? ' ± is one standard deviation; it is approximate. Race driver bars are scaled to match how much ratings actually revise; car bars are somewhat narrow still. Differences smaller than the bars are not reliable.'
    : '';
  controls.ratingsNote.textContent = `${DESCRIPTIONS[pref.metric]}${probability ? '' : ' 1,000 is the average; higher is faster.'} Each rating uses only results up to this weekend.${sdNote}${formNote} Data through ${dateFormat.format(Date.parse(latest.date))}${isLatest ? '' : ' (you are viewing history)'}. Press a row to select it for comparison.`;
  hideTooltip();
  drawList(rows, snap, pref.metric, probability, st);
  syncTimeline(snap);
  updateSelection();
}
