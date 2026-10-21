// History view: rating lines for a few drivers or cars over a range of seasons,
// with removable chips, a searchable "add" list, a season range and a table twin.
import { state } from './state.js';
import { el } from './dom.js';
import { esc } from './utils.js';
import { drawChart, metricLabel, metricValue } from './charts.js';
import { seriesColor } from './chart-renderer.js';
import { carIdentity } from '../../packages/core/src/lineage.js';
import { DESCRIPTIONS, METRICS, NAMES, isProbability } from './metric-text.js';

const MAX_SERIES = 8;
const PLOT_PADDING = 10; // pixels of the plate (CSS .history-plot) above and below the chart
const DEFAULT_SERIES = 5;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function createHistoryView({ onChange }) {
  const hist = {
    entity: 'driver',
    driverMetric: 'combined',
    carMetric: 'combined',
    from: null,
    to: null,
    drivers: null,
    cars: null,
  };
  let view = 'chart';
  let root = null;
  let ui = {};
  let seasons = [];

  const key = () => (hist.entity === 'driver' ? 'drivers' : 'cars');
  const metric = () => hist[`${hist.entity}Metric`];
  // A team that only changed its name is one car with one line, labelled with its latest name. The model keeps
  // each id's own history, so the lines are joined here, keyed by the car's identity (see lineage.js).
  let joined = null;
  function joinedCars() {
    if (joined?.model === state.model) return joined;
    const lines = new Map();
    for (const [id, points] of state.model.ch) {
      const car = carIdentity(id);
      if (!lines.has(car)) lines.set(car, []);
      lines.get(car).push(...points);
    }
    const labels = new Map();
    for (const [car, points] of lines) {
      points.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      labels.set(car, state.model.cname.get(String(points.at(-1).constructorId)) || car);
    }
    joined = { model: state.model, lines, labels };
    return joined;
  }
  const entityId = (id) => (hist.entity === 'car' ? carIdentity(id) : String(id));
  const series = () => (hist.entity === 'driver' ? state.model?.dh : state.model && joinedCars().lines) || new Map();
  const names = () => (hist.entity === 'driver' ? state.model?.dname : state.model && joinedCars().labels) || new Map();
  const inRange = (points) => points.filter((p) => p.year >= hist.from && p.year <= hist.to);

  function build() {
    root = document.createElement('div');
    root.className = 'history';
    root.id = 'historyFrame';
    root.innerHTML = `
      <div class="frame-tools">
        <div class="segmented" role="group" aria-label="Show">
          <button type="button" id="historyDrivers" aria-pressed="true">Drivers</button>
          <button type="button" id="historyCars" aria-pressed="false">Cars</button>
        </div>
        <label class="field"><span class="sr-only">Rating</span><select id="historyMetric"></select></label>
        <div class="segmented spacer" role="group" aria-label="View">
          <button type="button" id="historyChartView" aria-pressed="true">Chart</button>
          <button type="button" id="historyTableView" aria-pressed="false">Table</button>
        </div>
      </div>
      <div class="series-chips" id="historyChips"></div>
      <div class="history-plot" id="historyPlot">
        <svg id="driverChart" class="chart"></svg>
        <svg id="carChart" class="chart" hidden></svg>
        <div id="historyTable" class="table-wrap" hidden></div>
      </div>
      <div class="season-range">
        <span class="season-range-label" id="historyRangeLabel">Seasons</span>
        <div class="season-range-slider" role="group" aria-labelledby="historyRangeLabel">
          <div class="season-range-track"><div class="season-range-fill" id="historyFill"></div></div>
          <input type="range" id="historyFrom" min="0" max="0" step="1" aria-label="First season" />
          <input type="range" id="historyTo" min="0" max="0" step="1" aria-label="Last season" />
        </div>
        <div class="segmented" role="group" aria-label="Range presets" id="historyPresets">
          <button type="button" data-span="all">All</button>
          <button type="button" data-span="10">10 years</button>
          <button type="button" data-span="5">5 years</button>
        </div>
      </div>
      <p class="notes" id="historyNote"></p>`;
    el.chartsPanel.replaceChildren(root);
    ui = Object.fromEntries([...root.querySelectorAll('[id]')].map((n) => [n.id, n]));

    for (const [id, entity] of [
      ['historyDrivers', 'driver'],
      ['historyCars', 'car'],
    ]) {
      ui[id].addEventListener('click', () => {
        hist.entity = entity;
        ensureSelection();
        render();
        onChange();
      });
    }
    ui.historyMetric.addEventListener('change', () => {
      hist[`${hist.entity}Metric`] = ui.historyMetric.value;
      render();
      onChange();
    });
    for (const [id, next] of [
      ['historyChartView', 'chart'],
      ['historyTableView', 'table'],
    ]) {
      ui[id].addEventListener('click', () => {
        view = next;
        render();
      });
    }
    const onRange = (which) => () => {
      const a = +ui.historyFrom.value;
      const b = +ui.historyTo.value;
      if (which === 'from' && a > b) ui.historyTo.value = String(a);
      if (which === 'to' && b < a) ui.historyFrom.value = String(b);
      hist.from = seasons[+ui.historyFrom.value];
      hist.to = seasons[+ui.historyTo.value];
      render();
      onChange();
    };
    ui.historyFrom.addEventListener('input', onRange('from'));
    ui.historyTo.addEventListener('input', onRange('to'));
    // the chart is as tall as the room the panel leaves it, so it is drawn again when that changes
    let plotHeight = 0;
    new ResizeObserver(() => {
      const height = ui.historyPlot.clientHeight;
      if (height > 0 && height !== plotHeight) {
        plotHeight = height;
        render();
      }
    }).observe(ui.historyPlot);
    ui.historyPresets.addEventListener('click', (event) => {
      const span = event.target.closest('button')?.dataset.span;
      if (!span) return;
      const last = seasons.length - 1;
      ui.historyTo.value = String(last);
      ui.historyFrom.value = String(span === 'all' ? 0 : Math.max(0, last - (+span - 1)));
      onRange('from')();
    });
  }

  /** Entities that could be plotted: {id, name, last, first, latest, active}. */
  function catalog() {
    const latest = state.model.snaps[state.model.snaps.length - 1];
    const activeIds = new Set(
      (hist.entity === 'driver' ? latest.drivers : latest.cars).map((r) =>
        entityId(hist.entity === 'driver' ? r.driverId : r.constructorId),
      ),
    );
    return [...series().entries()]
      .map(([id, points]) => ({
        id: String(id),
        name: names().get(id) || String(id),
        last: points[points.length - 1]?.combined ?? NaN,
        first: points[0]?.year,
        latest: points[points.length - 1]?.year,
        active: activeIds.has(String(id)),
        points,
      }))
      .sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          (Number.isFinite(b.last) ? b.last : -Infinity) - (Number.isFinite(a.last) ? a.last : -Infinity) ||
          a.name.localeCompare(b.name),
      );
  }

  function ensureSelection() {
    const k = key();
    const known = new Set(series().keys());
    if (hist[k] === null)
      hist[k] = catalog()
        .slice(0, DEFAULT_SERIES)
        .map((c) => c.id);
    hist[k] = [...new Set(hist[k].map(entityId))].filter((id) => known.has(id)).slice(0, MAX_SERIES);
  }

  function refresh() {
    if (!state.model?.snaps.length) return;
    if (!root) build();
    seasons = [...new Set(state.model.snaps.map((s) => +s.year))].sort((a, b) => a - b);
    const latest = seasons[seasons.length - 1];
    const snap = (year, fallback) =>
      seasons.reduce((best, s) => (Math.abs(s - (year ?? fallback)) < Math.abs(best - (year ?? fallback)) ? s : best), latest);
    ensureSelection();
    // the seasons start where the lines do, until the visitor chooses (or a link says) otherwise
    const earliest = Math.min(...hist[key()].map((id) => series().get(id)?.[0]?.year ?? Infinity));
    hist.from = snap(hist.from, Number.isFinite(earliest) ? earliest : seasons[0]);
    hist.to = snap(hist.to, latest);
    if (hist.from > hist.to) hist.to = hist.from;
    for (const input of [ui.historyFrom, ui.historyTo]) input.max = String(seasons.length - 1);
    ui.historyFrom.value = String(seasons.indexOf(hist.from));
    ui.historyTo.value = String(seasons.indexOf(hist.to));
    render();
  }

  const raceNames = () => new Map(state.model.snaps.map((s) => [String(s.raceId), s.name]));

  /** Time axis for the chosen seasons: first weekend of `from` to last weekend of `to`. */
  function seasonSpan() {
    const dates = state.model.snaps.filter((s) => +s.year >= hist.from && +s.year <= hist.to).map((s) => Date.parse(s.date));
    return dates.length ? [Math.min(...dates) - 14 * 86400000, Math.max(...dates) + 14 * 86400000] : undefined;
  }

  function renderChips() {
    const k = key();
    const type = hist.entity;
    const svg = ui[`${type}Chart`];
    const ids = hist[k];
    const chips = ids.map((id) => {
      const chip = document.createElement('span');
      chip.className = 'series-chip';
      chip.style.setProperty('--c', seriesColor(svg, { id }, type));
      const swatch = document.createElement('i');
      swatch.setAttribute('aria-hidden', 'true');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${names().get(id) || id}`);
      remove.addEventListener('click', () => {
        hist[k] = hist[k].filter((x) => x !== id);
        render();
        onChange();
      });
      chip.append(swatch, document.createTextNode(names().get(id) || id), remove);
      return chip;
    });
    const adder = document.createElement('div');
    adder.className = 'series-picker';
    const input = document.createElement('input');
    input.type = 'search';
    input.autocomplete = 'off';
    input.placeholder = ids.length >= MAX_SERIES ? `Up to ${MAX_SERIES} at once` : `Add a ${type}`;
    input.disabled = ids.length >= MAX_SERIES;
    input.setAttribute('aria-label', `Add a ${type} to the chart`);
    const list = document.createElement('div');
    list.className = 'series-picker-list';
    list.hidden = true;
    const add = (id) => {
      hist[k] = [...hist[k], id].slice(0, MAX_SERIES);
      render();
      onChange();
    };
    const fill = () => {
      const query = input.value.trim().toLowerCase();
      const options = catalog()
        .filter((c) => !hist[k].includes(c.id) && inRange(c.points).length && (!query || c.name.toLowerCase().includes(query)))
        .slice(0, 40);
      list.replaceChildren(
        ...(options.length
          ? options.map((c) => {
              const b = document.createElement('button');
              b.type = 'button';
              b.textContent = c.name;
              const years = document.createElement('span');
              years.textContent = c.first === c.latest ? String(c.first) : `${c.first}–${c.latest}`;
              b.append(years);
              b.addEventListener('click', () => add(c.id));
              return b;
            })
          : [Object.assign(document.createElement('p'), { textContent: 'No match in this range.' })]),
      );
      list.hidden = false;
    };
    input.addEventListener('focus', fill);
    input.addEventListener('input', fill);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !list.hidden) {
        list.hidden = true;
        event.preventDefault(); // the first Escape puts the list away; the panel's own Escape (back to the ratings) is for the next one
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        list.querySelector('button')?.click();
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        list.querySelector('button')?.focus();
      }
    });
    adder.addEventListener('focusout', (event) => {
      if (!adder.contains(event.relatedTarget)) list.hidden = true;
    });
    adder.append(input, list);
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn-quiet';
    clear.textContent = 'Clear all';
    clear.hidden = ids.length === 0;
    clear.addEventListener('click', () => {
      hist[k] = [];
      render();
      onChange();
    });
    ui.historyChips.replaceChildren(...chips, adder, clear);
  }

  function renderTable() {
    const k = key();
    const m = metric();
    const probability = isProbability(m);
    const ids = hist[k];
    const rows = seasons.filter((y) => y >= hist.from && y <= hist.to);
    const value = (id, year) => {
      const points = (series().get(id) || []).filter((p) => p.year === year);
      const p = points[points.length - 1];
      const v = p ? metricValue(p, m, hist.entity) : NaN;
      return Number.isFinite(v) ? (probability ? `${v.toFixed(1)}%` : v.toFixed(0)) : '—'; // a rating is a whole number: its error is several points
    };
    ui.historyTable.innerHTML = `<div class="scroll"><table><caption>${esc(NAMES[m])} at the last weekend of each season</caption><thead><tr><th scope="col">Season</th>${ids.map((id) => `<th scope="col">${esc(names().get(id) || id)}</th>`).join('')}</tr></thead><tbody>${rows
      .map((y) => `<tr><th scope="row">${y}</th>${ids.map((id) => `<td>${value(id, y)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div>`;
  }

  function render() {
    if (!root || !state.model) return;
    const type = hist.entity;
    const m = metric();
    for (const [id, on] of [
      ['historyDrivers', type === 'driver'],
      ['historyCars', type === 'car'],
      ['historyChartView', view === 'chart'],
      ['historyTableView', view === 'table'],
    ])
      ui[id].setAttribute('aria-pressed', String(on));
    ui.historyMetric.innerHTML = METRICS[type]
      .map((x) => `<option value="${x}"${x === m ? ' selected' : ''}>${esc(NAMES[x])}</option>`)
      .join('');
    ui.historyMetric.title = `${DESCRIPTIONS[m]}${isProbability(m) ? '' : ' 1,000 is the average of the field.'}`;
    ui.historyNote.textContent =
      type === 'car'
        ? 'A car carries over only partly into a new season, so the lines step. Hover or use the arrow keys to read a weekend.'
        : 'Each point is the rating after a weekend; gaps are seasons out. Hover or use the arrow keys to read a weekend.';
    const fill = ui.historyFill;
    const top = Math.max(1, seasons.length - 1);
    fill.style.left = `${(seasons.indexOf(hist.from) / top) * 100}%`;
    fill.style.right = `${100 - (seasons.indexOf(hist.to) / top) * 100}%`;
    ui.historyRangeLabel.textContent = `Seasons ${hist.from}–${hist.to}`;
    ui.driverChart.toggleAttribute('hidden', type !== 'driver' || view !== 'chart');
    ui.carChart.toggleAttribute('hidden', type !== 'car' || view !== 'chart');
    ui.historyTable.hidden = view !== 'table';
    const svg = ui[`${type}Chart`];
    const k = key();
    drawChart(svg, null, hist[k], new Map(hist[k].map((id) => [id, inRange(series().get(id) || [])])), names(), m, type, {
      xDomain: seasonSpan(),
      pointLabel: (p) => raceNames().get(String(p.raceId)),
      legend: false, // the chips name the lines
      height: () => Math.max(0, ui.historyPlot.clientHeight - PLOT_PADDING), // (0 while the view is hidden: the renderer then takes its own)
    });
    renderChips();
    if (view === 'table') renderTable();
    ui.driverChart.style.display = ui.driverChart.hasAttribute('hidden') ? 'none' : 'block';
    ui.carChart.style.display = ui.carChart.hasAttribute('hidden') ? 'none' : 'block';
  }

  return {
    state: hist,
    refresh,
    render,
    /** Restore state from URL parameters (already validated as a whole). */
    readURL(params) {
      if (['driver', 'car'].includes(params.get('h'))) hist.entity = params.get('h');
      for (const type of ['driver', 'car']) {
        const k = type === 'driver' ? 'drivers' : 'cars';
        if (params.has(k))
          hist[k] = [
            ...new Set(
              params
                .get(k)
                .split(',')
                .filter((id) => ID.test(id)),
            ),
          ].slice(0, MAX_SERIES);
        const m = params.get(type === 'driver' ? 'dm' : 'cm');
        if (METRICS[type].includes(m)) hist[`${type}Metric`] = m;
      }
      for (const k of ['from', 'to']) {
        const year = Number(params.get(k));
        if (Number.isInteger(year) && year >= 1950 && year <= 2100) hist[k] = year;
      }
    },
    writeURL(params) {
      params.set('h', hist.entity);
      params.set('dm', hist.driverMetric);
      params.set('cm', hist.carMetric);
      for (const k of ['drivers', 'cars']) if (hist[k] !== null) params.set(k, hist[k].join(','));
      for (const k of ['from', 'to']) if (hist[k] !== null) params.set(k, String(hist[k]));
    },
    /** Opened from the ratings of the drivers or of the cars: it shows the same. */
    show(entity) {
      if (['driver', 'car'].includes(entity)) hist.entity = entity;
    },
    /** "Compare in history" from the ratings page. */
    compare({ entity, ids, metric: m }, year) {
      hist.entity = entity;
      hist[entity === 'driver' ? 'drivers' : 'cars'] = [
        ...new Set(ids.map((id) => (entity === 'car' ? carIdentity(id) : String(id)))),
      ].slice(0, MAX_SERIES);
      hist[`${entity}Metric`] = m;
      hist.to = year;
      hist.from = Math.max(seasons[0] ?? 2000, year - 9);
    },
    get metricLabel() {
      return metricLabel(metric());
    },
  };
}
