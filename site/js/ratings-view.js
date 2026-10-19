// Ratings view: a ranked lollipop chart (or table) for one race weekend, with a
// season/Grand Prix picker and a play/scrub timeline over every weekend.
import { state } from './state.js';
import { el } from './dom.js';
import { esc } from './utils.js';
import { clamp } from '../../packages/core/src/math.js';
import { exportCSV } from './export.js';
import { metricLabel, metricValue } from './charts.js';
import { hideTooltip, inspectTarget, node } from './chart-renderer.js';
import { decimalsFor, niceTicks } from './chart-math.js';
import { DESCRIPTIONS, NAMES, isProbability } from './metric-text.js';

// Recent form adjusts the race-pace ratings only.
const FORM_METRICS = ['combined', 'race'];

const preferences = {
  driver: { metric: 'combined', selected: new Set() },
  car: { metric: 'combined', selected: new Set() },
};
let entity = 'driver';
let view = 'chart';
const layers = { rating: true, form: false };
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
let chartWidth = 0;
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
      <h2 class="frame-title" id="ratingsTitle"></h2>
      <p class="frame-sub" id="ratingsSub"></p>
    </header>
    <div class="frame-tools">
      <div class="segmented" role="group" aria-label="Show">
        <button type="button" id="ratingsDrivers" aria-pressed="true">Drivers</button>
        <button type="button" id="ratingsCars" aria-pressed="false">Cars</button>
      </div>
      <label class="field">Rating<select id="ratingsMetric"></select></label>
      <div class="segmented" role="group" aria-label="Layers">
        <button type="button" id="ratingsLayerRating" aria-pressed="true">Rating</button>
        <button type="button" id="ratingsLayerForm" aria-pressed="false">With recent form</button>
      </div>
      <div class="segmented" role="group" aria-label="Uncertainty">
        <button type="button" id="ratingsSd" aria-pressed="true">Uncertainty</button>
      </div>
      <div class="segmented spacer" role="group" aria-label="View">
        <button type="button" id="ratingsChartView" aria-pressed="true">Chart</button>
        <button type="button" id="ratingsTableView" aria-pressed="false">Table</button>
      </div>
    </div>
    <div class="frame-body">
      <p class="layer-key" id="ratingsKey" hidden><span><i style="background:var(--s1)"></i>Rating</span><span><i style="background:var(--s2)"></i>With recent form</span></p>
      <svg id="ratingsChart" role="group"></svg>
      <div id="ratingsTable" class="table-wrap" hidden></div>
    </div>
    <div class="timeline">
      <button type="button" class="play" id="ratingsPlay" aria-label="Play through the weekends"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${PLAY_PATH}"/></svg></button>
      <div class="scrub">
        <span class="scrub-now" id="ratingsNow"></span>
        <input type="range" id="ratingsScrub" min="0" max="0" value="0" step="1" aria-label="Race weekend" />
        <div class="scrub-ticks" id="ratingsTicks" aria-hidden="true"></div>
      </div>
      <div class="timeline-pickers">
        <label class="field">Season<select id="ratingsSeason"></select></label>
        <label class="field">Grand Prix<select id="ratingsGp"></select></label>
      </div>
    </div>
    <div class="selection-bar" id="ratingsSelection" role="region" aria-label="Selected for comparison" hidden>
      <p class="selection-names" id="ratingsSelectionNames"></p>
      <div class="selection-actions">
        <button type="button" id="ratingsCompareHistory" class="btn-primary">Compare in history</button>
        <button type="button" id="ratingsCompareHeadToHead">Head to head</button>
        <button type="button" id="ratingsClearSelection" class="btn-quiet">Clear</button>
      </div>
    </div>
    <footer class="frame-foot">
      <p class="notes" id="ratingsNote"></p>
      <div class="frame-actions">
        <button type="button" id="ratingsExport" class="btn-quiet">Download CSV</button>
        <span class="notes">Shared under CC BY-NC-SA 4.0 · <a href="#/about">credits and terms</a></span>
      </div>
    </footer>`;
  el.ratingsHost.append(panel);
  controls = Object.fromEntries([...panel.querySelectorAll('[id]')].map((n) => [n.id, n]));

  for (const [id, which] of [
    ['ratingsDrivers', 'driver'],
    ['ratingsCars', 'car'],
  ]) {
    controls[id].addEventListener('click', () => {
      stop();
      entity = which;
      renderRatings();
    });
  }
  controls.ratingsMetric.addEventListener('change', () => {
    preferences[entity].metric = controls.ratingsMetric.value;
    renderRatings();
  });
  // Independent toggles; at least one layer stays on.
  controls.ratingsLayerRating.addEventListener('click', () => {
    layers.rating = !layers.rating;
    if (!layers.rating && !layers.form) layers.form = true;
    renderRatings();
  });
  controls.ratingsLayerForm.addEventListener('click', () => {
    layers.form = !layers.form;
    if (!layers.form && !layers.rating) layers.rating = true;
    renderRatings();
  });
  controls.ratingsSd.addEventListener('click', () => {
    showSd = !showSd;
    renderRatings();
  });
  for (const [id, next] of [
    ['ratingsChartView', 'chart'],
    ['ratingsTableView', 'table'],
  ]) {
    controls[id].addEventListener('click', () => {
      view = next;
      renderRatings();
    });
  }
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
      if (width > 0 && width !== chartWidth) {
        chartWidth = width;
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

function shiftParts(row) {
  const v = Number((row.shift ?? 0).toFixed(1));
  if (v === 0) return { text: '0.0', tone: '' };
  return { text: `${v > 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}`, tone: v > 0 ? 'var(--pos)' : 'var(--neg)' };
}

/**
 * Which layers are on. "With recent form" adds the forecast model's form shift to
 * the pace rating, which only exists for drivers, for combined or race pace, on the
 * latest weekend; otherwise it is unavailable and the rating is shown.
 */
function layerState(pref) {
  let reason = '';
  if (entity !== 'driver') reason = 'Recent form is only shown for drivers.';
  else if (!FORM_METRICS.includes(pref.metric)) reason = 'Recent form applies to Combined and Race pace.';
  else if (currentIndex() !== state.model.snaps.length - 1) reason = 'Recent form is only shown for the latest weekend.';
  const shifts = reason ? null : state.model.formShifts;
  if (!reason && !shifts) reason = 'Recent form is not available for this model.';
  const showForm = layers.form && !reason;
  return { shifts, reason, showForm, showRating: layers.rating || !showForm, sd: false };
}

/** Rows ranked by what is being shown: the form-adjusted value only when the rating is hidden. */
function withForm(rows, st) {
  if (!st.showForm) return rows;
  const decorated = rows.map((row) => {
    const shift = st.shifts.get(row.id) ?? 0;
    return { ...row, shift, formValue: row.value + shift };
  });
  const key = st.showRating ? 'value' : 'formValue';
  return decorated.sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name)).map((row, i) => ({ ...row, rank: i + 1 }));
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
}

function drawRows(rows, snap, metric, probability, st) {
  const svg = controls.ratingsChart;
  const selected = preferences[entity].selected;
  const { showRating, showForm } = st;
  const both = showRating && showForm;
  const width = Math.max(300, Math.round(panel.getBoundingClientRect().width - 24) || 800);
  const compact = width < 520;
  const showTeam = entity === 'driver' && width >= (both ? 900 : 780);
  const rowHeight = compact ? 54 : 32;
  const top = 34;
  const height = top + rows.length * rowHeight + 34;
  const markerSpace = 30; // the round select marker at the start of every row
  const left = compact ? 12 : showTeam ? 330 + markerSpace : 214 + markerSpace;
  const right = compact ? width - 12 : width - (both ? 222 : 138);
  const ratingX = both ? width - 152 : width - 62;
  const formX = width - 76;
  const lastX = width - 2;
  const sdFor = (r) => (st.sd ? sdOf(r, metric) : NaN);
  const values = rows
    .flatMap((r) => [
      showRating || !showForm ? r.value : NaN,
      showForm ? r.formValue : NaN,
      showRating || !showForm ? r.value - (sdFor(r) || 0) : NaN,
      showRating || !showForm ? r.value + (sdFor(r) || 0) : NaN,
    ])
    .filter(Number.isFinite);
  const { ticks, lo, hi, step } = niceTicks(
    values.length ? Math.min(...values) : 0,
    values.length ? Math.max(...values) : 1,
    compact ? 4 : 6,
  );
  const X = (v) => left + ((v - lo) / (hi - lo)) * (right - left);
  const origin = !probability && lo <= 1000 && hi >= 1000 ? 1000 : lo;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.height = `${height}px`;
  svg.setAttribute(
    'aria-label',
    `${entity === 'driver' ? 'Driver' : 'Car'} ratings, ${NAMES[metric] || metric}${showForm ? ', with recent form' : ''}. Rows are ranked; hover, focus or tap a row for details.`,
  );
  const T = (parent, x, y, value, attrs = {}) => node(parent, 'text', { x, y, fill: 'var(--ink-3)', 'font-size': 12, ...attrs }, value);

  if (!compact) {
    T(svg, 14 + markerSpace, 16, '#');
    T(svg, 42 + markerSpace, 16, entity === 'driver' ? 'Driver' : 'Car');
    if (showTeam) T(svg, 222 + markerSpace, 16, 'Team');
    if (both) {
      T(svg, ratingX, 16, 'Rating', { 'text-anchor': 'end' });
      T(svg, formX, 16, 'With form', { 'text-anchor': 'end' });
      T(svg, lastX, 16, 'Form shift', { 'text-anchor': 'end' });
    } else if (showForm) {
      T(svg, width - 76, 16, 'With form', { 'text-anchor': 'end' });
      T(svg, lastX, 16, 'Form shift', { 'text-anchor': 'end' });
    } else {
      T(svg, width - 62, 16, 'Rating', { 'text-anchor': 'end' });
      T(svg, lastX, 16, 'Change', { 'text-anchor': 'end' });
    }
  }
  const decimals = decimalsFor(step);
  const grid = node(svg, 'g', { 'aria-hidden': 'true' });
  for (const v of ticks) {
    node(grid, 'line', { x1: X(v), x2: X(v), y1: top - 6, y2: top + rows.length * rowHeight, stroke: 'var(--grid)', 'stroke-width': 1 });
    T(
      grid,
      X(v),
      height - 10,
      v.toLocaleString('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + (probability ? '%' : ''),
      { 'text-anchor': 'middle' },
    );
  }
  if (origin === 1000) {
    node(grid, 'line', {
      x1: X(1000),
      x2: X(1000),
      y1: top - 6,
      y2: top + rows.length * rowHeight,
      stroke: 'var(--ink-3)',
      'stroke-width': 1,
    });
    T(grid, X(1000), top - 12, 'Average', { 'text-anchor': 'middle', fill: 'var(--ink-2)', 'font-weight': 600 });
  }

  for (const row of rows) {
    const y = top + (row.rank - 1) * rowHeight;
    const mid = y + (compact ? 14 : rowHeight / 2);
    const trackY = compact ? y + 45 : mid;
    const chosen = selected.has(row.id);
    const group = node(svg, 'g', { class: 'rankrow', 'data-id': row.id, 'data-rank': row.rank });
    node(group, 'rect', { class: 'band', x: 0, y, width, height: rowHeight, fill: chosen ? 'var(--accent-wash)' : 'transparent', rx: 8 });
    const ink = { fill: 'var(--ink)', 'font-size': 14, 'font-weight': chosen ? 700 : 500 };
    const markerX = 16;
    node(group, 'circle', {
      class: 'select-marker',
      cx: markerX,
      cy: mid,
      r: 9,
      fill: chosen ? 'var(--accent)' : 'none',
      stroke: chosen ? 'var(--accent)' : 'var(--ink-3)',
      'stroke-width': 1.5,
    });
    if (chosen)
      node(group, 'path', {
        d: `M${markerX - 4} ${mid} l3 3 l5 -6`,
        fill: 'none',
        stroke: 'var(--on-accent)',
        'stroke-width': 2,
      });
    const rankX = markerSpace + (compact ? 4 : 14);
    T(group, rankX, mid + 5, row.rank, { 'font-size': 12 });
    T(
      group,
      compact ? 34 + markerSpace : 42 + markerSpace,
      mid + 5,
      (() => {
        const label = row.newDriver ? `${row.name} · new` : row.name; // a driver in his first races has a provisional rating
        const max = showTeam ? 26 : compact ? 30 : 24;
        return label.length > max ? `${label.slice(0, max - 1)}…` : label;
      })(),
      ink,
    );
    if (showTeam)
      T(group, 222 + markerSpace, mid + 5, (row.car || '').length > 18 ? `${row.car.slice(0, 17)}…` : row.car || '', { 'font-size': 13 });
    const change = changeParts(row, probability);
    const shift = showForm ? shiftParts(row) : null;
    const strong = { 'text-anchor': 'end', fill: 'var(--ink)', 'font-size': 14, 'font-weight': 700 };
    if (compact) {
      T(group, width - 12, mid + 5, fmt(showForm ? row.formValue : row.value, probability), strong);
      const sub = both ? `rating ${fmt(row.value, probability)} · ${shift.text}` : showForm ? `${shift.text} from form` : change.text;
      T(group, width - 12, mid + 21, sub, {
        'text-anchor': 'end',
        fill: (!both && (shift || change).tone) || 'var(--ink-3)',
        'font-size': 12,
      });
    } else if (both) {
      T(group, ratingX, mid + 5, fmt(row.value, probability), { ...strong, 'font-weight': 500, fill: 'var(--ink-2)' });
      T(group, formX, mid + 5, fmt(row.formValue, probability), strong);
      T(group, lastX, mid + 5, shift.text, { 'text-anchor': 'end', fill: shift.tone || 'var(--ink-3)', 'font-size': 13 });
    } else if (showForm) {
      T(group, formX, mid + 5, fmt(row.formValue, probability), strong);
      T(group, lastX, mid + 5, shift.text, { 'text-anchor': 'end', fill: shift.tone || 'var(--ink-3)', 'font-size': 13 });
    } else {
      T(group, width - 62, mid + 5, fmt(row.value, probability), strong);
      T(group, lastX, mid + 5, change.text, { 'text-anchor': 'end', fill: change.tone || 'var(--ink-3)', 'font-size': 13 });
    }
    const dot = (value, colour) => {
      node(group, 'circle', {
        cx: X(value),
        cy: trackY,
        r: 5.5,
        fill: colour,
        stroke: chosen ? 'var(--ink)' : 'var(--surface)',
        'stroke-width': 2,
      });
    };
    const stem = (value, colour) => {
      node(group, 'line', {
        x1: X(origin),
        x2: X(value),
        y1: trackY,
        y2: trackY,
        stroke: colour,
        'stroke-width': 2,
        'stroke-opacity': 0.55,
        'stroke-linecap': 'round',
      });
    };
    const sd = sdFor(row);
    if (Number.isFinite(row.value) && Number.isFinite(sd) && (showRating || !showForm)) {
      // one standard deviation either side of the rating, drawn first so the dot sits on top
      const whisker = { stroke: 'var(--ink-3)', 'stroke-width': 1.5, 'stroke-opacity': 0.8, 'stroke-linecap': 'round' };
      node(group, 'line', { x1: X(row.value - sd), x2: X(row.value + sd), y1: trackY, y2: trackY, ...whisker });
      for (const edge of [row.value - sd, row.value + sd])
        node(group, 'line', { x1: X(edge), x2: X(edge), y1: trackY - 4, y2: trackY + 4, ...whisker });
    }
    if (Number.isFinite(row.value)) {
      if (both) {
        stem(row.value, 'var(--s1)');
        node(group, 'line', {
          x1: X(row.value),
          x2: X(row.formValue),
          y1: trackY,
          y2: trackY,
          stroke: 'var(--ink-3)',
          'stroke-width': 3,
          'stroke-linecap': 'round',
        });
        dot(row.value, 'var(--s1)');
        dot(row.formValue, 'var(--s2)');
      } else if (showForm) {
        stem(row.formValue, 'var(--s2)');
        dot(row.formValue, 'var(--s2)');
      } else {
        stem(row.value, 'var(--s1)');
        dot(row.value, 'var(--s1)');
      }
    }
    group.addEventListener('click', () => toggleSelected(row));
    inspectTarget(
      group,
      () => description(row, snap, metric, probability, st),
      (key) => {
        if (key === 'Enter' || key === ' ') toggleSelected(row);
      },
    );
    group.style.cursor = 'pointer';
  }
  if (!rows.length) T(svg, 0, 48, 'No entries for this weekend.');
}

function drawTable(rows, metric, probability, st) {
  const selected = preferences[entity].selected;
  const { showRating, showForm } = st;
  const sdCol = st.hasSd && (showRating || !showForm);
  const head = [
    showRating || !showForm ? '<th scope="col">Rating</th>' : '',
    sdCol ? '<th scope="col" title="One standard deviation, approximate">±</th>' : '',
    showForm ? '<th scope="col">With form</th><th scope="col">Form shift</th>' : '<th scope="col">Change</th>',
  ].join('');
  controls.ratingsTable.innerHTML = `<table><caption>${esc(NAMES[metric] || metricLabel(metric))}${showForm ? ', with recent form' : ' · change since previous appearance'}</caption><thead><tr><th scope="col">#</th><th scope="col">${entity === 'driver' ? 'Driver' : 'Car'}</th>${entity === 'driver' ? '<th scope="col" class="left">Team</th>' : ''}${head}<th scope="col">Compare</th></tr></thead><tbody>${rows
    .map((row) => {
      const change = changeParts(row, probability);
      const shift = showForm ? shiftParts(row) : null;
      const cells = [
        showRating || !showForm ? `<td>${showForm ? fmt(row.value, probability) : `<b>${fmt(row.value, probability)}</b>`}</td>` : '',
        sdCol
          ? `<td style="color:var(--ink-3)">${Number.isFinite(sdOf(row, metric)) ? `± ${sdOf(row, metric).toFixed(0)}` : '—'}</td>`
          : '',
        showForm
          ? `<td><b>${fmt(row.formValue, probability)}</b></td><td style="color:${shift.tone || 'var(--ink-3)'}">${shift.text}</td>`
          : `<td style="color:${change.tone || 'var(--ink-3)'}">${change.text}</td>`,
      ].join('');
      return `<tr><td>${row.rank}</td><th scope="row" class="left">${esc(row.name)}${row.newDriver ? ' <small style="color:var(--ink-3);font-weight:500">new</small>' : ''}</th>${entity === 'driver' ? `<td class="left">${esc(row.car || '')}</td>` : ''}${cells}<td><input type="checkbox" value="${esc(row.id)}" aria-label="Compare ${esc(row.name)}"${selected.has(row.id) ? ' checked' : ''}></td></tr>`;
    })
    .join('')}</tbody></table>`;
  for (const box of controls.ratingsTable.querySelectorAll('input')) {
    box.addEventListener('change', () => {
      if (box.checked && selected.size < MAX_SELECTED) selected.add(box.value);
      else if (box.checked) box.checked = false;
      else selected.delete(box.value);
      updateSelection();
    });
  }
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
  const frac = n > 1 ? index / (n - 1) : 0;
  controls.ratingsNow.textContent = dateFormat.format(Date.parse(snap.date));
  // Follow the thumb, but keep the date label inside the track at both ends.
  const track = scrub.clientWidth;
  const half = controls.ratingsNow.offsetWidth / 2;
  controls.ratingsNow.style.left = `${clamp(8 + (track - 16) * frac, half, Math.max(half, track - half))}px`;
  scrub.setAttribute('aria-valuetext', `${snap.year} ${snap.name}`);
  const years = [...new Set(snaps.map((s) => s.year))];
  if (controls.ratingsSeason.options.length !== years.length) {
    controls.ratingsSeason.replaceChildren(...years.map((y) => new Option(String(y), String(y))));
    const ticks = controls.ratingsTicks;
    ticks.style.margin = '2px 8px 0';
    const span = Math.max(1, Math.round((years.length * 44) / Math.max(320, panel.getBoundingClientRect().width - 120) + 0.49));
    const every = [1, 2, 5, 10].find((s) => s >= span) || 10;
    ticks.replaceChildren(
      ...years
        .filter((y) => y % every === 0 || y === years[0])
        .map((y) => {
          const s = document.createElement('span');
          s.textContent = String(y);
          s.style.left = `${(snaps.findIndex((x) => x.year === y) / Math.max(1, n - 1)) * 100}%`;
          return s;
        }),
    );
  }
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
    ['ratingsChartView', view === 'chart'],
    ['ratingsTableView', view === 'table'],
  ])
    controls[id].setAttribute('aria-pressed', String(on));
  const snap = state.model?.snaps[currentIndex()];
  if (!snap) {
    controls.ratingsTitle.textContent = 'Ratings';
    controls.ratingsSub.textContent = 'No modelled weekends available.';
    controls.ratingsChart.replaceChildren();
    controls.ratingsTable.replaceChildren();
    return;
  }
  const st = layerState(pref);
  const baseRows = ratingRows(state.model, currentIndex(), entity, pref.metric);
  const hasSd = baseRows.some((r) => Number.isFinite(sdOf(r, pref.metric)));
  ratingDecimals = hasSd ? 0 : 1;
  st.hasSd = hasSd;
  st.sd = showSd && hasSd;
  controls.ratingsSd.setAttribute('aria-pressed', String(st.sd));
  controls.ratingsSd.toggleAttribute('disabled', !hasSd);
  controls.ratingsSd.title = hasSd ? 'Show one standard deviation either side of each rating' : 'This rating has no uncertainty estimate';
  const rows = withForm(baseRows, st);
  const probability = isProbability(pref.metric);
  controls.ratingsLayerRating.setAttribute('aria-pressed', String(st.showRating));
  controls.ratingsLayerForm.setAttribute('aria-pressed', String(st.showForm));
  controls.ratingsLayerForm.toggleAttribute('disabled', Boolean(st.reason));
  controls.ratingsLayerForm.title = st.reason;
  controls.ratingsKey.hidden = !(st.showRating && st.showForm) || view !== 'chart';
  const latest = state.model.snaps[state.model.snaps.length - 1];
  const isLatest = String(snap.raceId) === String(latest.raceId);
  controls.ratingsTitle.textContent = `${entity === 'driver' ? 'Driver' : 'Car'} ratings after the ${snap.year} ${snap.name}`;
  controls.ratingsSub.textContent = `${DESCRIPTIONS[pref.metric]}${probability ? '' : ' 1,000 is the average; higher is faster.'}`;
  const formNote = st.showForm
    ? ' Rating is long-run pace. Form is the forecast model’s adjustment for the last few races, in rating points, relative to the teammate.'
    : st.reason && layers.form
      ? ` ${st.reason}`
      : ' Change is since the previous appearance.';
  const sdNote = st.sd
    ? ' Bars show one standard deviation; they are approximate. Race driver bars are scaled to match how much ratings actually revise; car bars are somewhat narrow still. Differences smaller than the bars are not reliable.'
    : '';
  controls.ratingsNote.textContent = `Each rating uses only results up to this weekend.${sdNote}${formNote} Data through ${dateFormat.format(Date.parse(latest.date))}${isLatest ? '' : ' (you are viewing history)'}. Select drivers or cars with the round marker to compare them.`;
  controls.ratingsChart.toggleAttribute('hidden', view !== 'chart');
  controls.ratingsChart.style.display = view === 'chart' ? 'block' : 'none';
  controls.ratingsTable.hidden = view !== 'table';
  hideTooltip();
  drawRows(rows, snap, pref.metric, probability, st);
  drawTable(rows, pref.metric, probability, st);
  syncTimeline(snap);
  updateSelection();
}
