// Shared SVG chart renderer: line charts with a crosshair and direct labels,
// scatter plots, and the legend/tooltip they share.
//
// Colours come from the validated 8-slot categorical palette (--s1 … --s8) and
// stay with their entity while the selection changes (see assignSlots).
import { assignSlots, decimalsFor, nearestIndex, niceTicks, slotFor, spreadLabels, timeTicks } from './chart-math.js';

const NS = 'http://www.w3.org/2000/svg';
const charts = new WeakMap();
const dragging = new WeakSet(); // the charts whose time cursor is being dragged: they are not drawn again until it is let go
const timeCursors = new WeakMap(); // svg -> the function that moves its markers (the chart is not drawn again for that: it would drop a drag in progress)
const slotsBySvg = new WeakMap();
let tooltip;

const cssVar = (slot) => `var(--s${slot + 1})`;

/** Deterministic colour for an entity when no selection context exists. */
export function entityColor(type, id) {
  return cssVar(slotFor(`${type}:${id}`));
}

/** The colour a series wears in `svg`: fixed if it carries one, else its held slot. */
export function seriesColor(svg, s, type) {
  if (s.color) return s.color;
  const slot = slotsBySvg.get(svg)?.get(s.id);
  return slot == null ? entityColor(type, s.id) : cssVar(slot);
}

export function timeOf(p) {
  const t = Date.parse(p.date);
  return Number.isFinite(t) ? t : Date.UTC(p.year, 0, 1);
}

export function splitSegments(points) {
  const groups = [];
  let previous;
  for (const p of points) {
    if (!Number.isFinite(p.v) || !Number.isFinite(timeOf(p))) {
      previous = null;
      continue;
    }
    const gap =
      !previous ||
      previous.gap ||
      p.gap ||
      (Number.isFinite(p.sequence) && Number.isFinite(previous.sequence) && p.sequence !== previous.sequence + 1) ||
      timeOf(p) <= timeOf(previous) ||
      (!p.contiguous && timeOf(p) - timeOf(previous) > 240 * 86400000); // a winter break; annual series set `contiguous`
    if (gap) groups.push([]);
    groups[groups.length - 1].push(p);
    previous = p;
  }
  return groups;
}

export function node(svg, tag, attrs, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  svg.appendChild(n);
  return n;
}

// ── tooltip ────────────────────────────────────────────────

function tipElement() {
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'chartValueTooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('[data-chart-target], svg[data-crosshair]')) tooltip.hidden = true;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') tooltip.hidden = true;
    });
  }
  return tooltip;
}

export function hideTooltip() {
  if (tooltip) tooltip.hidden = true;
}

function placeTip(tip, x, y) {
  tip.style.left = `${Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, x + 14))}px`;
  tip.style.top = `${Math.max(8, Math.min(window.innerHeight - tip.offsetHeight - 8, y + 14))}px`;
}

/** Plain-text tooltip on a focusable mark (rows, scatter points). */
export function inspectTarget(target, getText, onKey) {
  target.setAttribute('tabindex', '0');
  target.setAttribute('role', 'button');
  target.setAttribute('data-chart-target', 'true');
  target.setAttribute('aria-label', getText());
  const show = (event) => {
    const tip = tipElement();
    tip.className = 'plain';
    tip.textContent = getText(event);
    target.setAttribute('aria-label', tip.textContent);
    target.setAttribute('aria-describedby', tip.id);
    tip.hidden = false;
    const rect = target.getBoundingClientRect();
    placeTip(tip, event?.clientX ?? rect.left + rect.width / 2, event?.clientY ?? rect.top);
  };
  target.addEventListener('pointerenter', show);
  target.addEventListener('pointermove', show);
  target.addEventListener('pointerdown', show);
  target.addEventListener('focus', show);
  target.addEventListener('blur', hideTooltip);
  target.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') hideTooltip();
  });
  target.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      onKey?.(e.key);
      show();
    }
  });
}

// ── legend ─────────────────────────────────────────────────

export function renderLegend(svg, legend, series, type, hidden, toggle) {
  if (!legend) return;
  if (svg.nextElementSibling !== legend) svg.after(legend);
  const focused = legend.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  legend.replaceChildren();
  legend.setAttribute('role', 'group');
  legend.setAttribute('aria-label', 'Series — click to show or hide');
  if (series.length < 2) return; // a single series is named by the title
  for (const s of series) {
    const button = document.createElement('button');
    const off = hidden.has(s.id);
    button.type = 'button';
    button.className = 'key';
    button.dataset.id = s.id;
    button.style.setProperty('--c', seriesColor(svg, s, type));
    button.setAttribute('aria-pressed', String(!off));
    button.title = `${off ? 'Show' : 'Hide'} ${s.name}`;
    const swatch = document.createElement('i');
    swatch.setAttribute('aria-hidden', 'true');
    button.append(swatch, document.createTextNode(`${s.name}${s.points?.length === 0 ? ' (no data)' : ''}`));
    button.addEventListener('click', () => {
      if (off) hidden.delete(s.id);
      else hidden.add(s.id);
      toggle();
    });
    legend.appendChild(button);
    if (focused === String(s.id)) button.focus();
  }
}

// ── layout ─────────────────────────────────────────────────

function setup(svg, redraw, height) {
  let cache = charts.get(svg);
  if (!cache) {
    cache = {};
    charts.set(svg, cache);
    if (typeof ResizeObserver !== 'undefined') {
      cache.observer = new ResizeObserver(() => {
        const width = Math.round(svg.getBoundingClientRect().width);
        if (width > 0 && width !== cache.width && !dragging.has(svg)) cache.redraw();
      });
      cache.observer.observe(svg);
    }
  }
  cache.redraw = redraw;
  cache.width = Math.round(svg.getBoundingClientRect().width);
  const width = Math.max(280, cache.width || 640);
  const h = (typeof height === 'function' ? height() : height) || (width < 520 ? 300 : 380);
  svg.replaceChildren();
  hideTooltip();
  svg.setAttribute('viewBox', `0 0 ${width} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'group');
  svg.style.width = '100%';
  svg.style.height = `${h}px`;
  svg.style.display = 'block';
  return { width, height: h };
}

function extent(values, probability, bounds) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const pad = Math.max((hi - lo) * 0.06, hi === lo ? Math.abs(hi) * 0.02 || 1e-3 : 0);
  lo -= pad;
  hi += pad;
  if (probability) {
    lo = Math.max(0, lo);
    hi = Math.min(100, hi);
  }
  if (Number.isFinite(bounds[0])) lo = bounds[0];
  if (Number.isFinite(bounds[1])) hi = bounds[1];
  return [lo, hi];
}

export function pointDescription(s, p, label) {
  return `${s.name}${p.car ? ' · ' + p.car : ''}\n${p.date || p.year}${p.round ? ' · Round ' + p.round : ''}\n${label}: ${p.v}${Number.isFinite(p.raw) && p.raw !== p.v ? '\nRaw model value: ' + p.raw : ''}`;
}

const dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const truncate = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

// ── the renderer ───────────────────────────────────────────

export function renderPlot(svg, options) {
  const { series, type, label, kind = 'line', xLabel = '', bounds = [], probability = false, reverse = false } = options;
  const { width, height } = setup(svg, () => renderPlot(svg, options), options.height);
  svg.removeAttribute('data-crosshair');
  svg.removeAttribute('tabindex');
  const all = options.domainSeries || series;
  const held = slotsBySvg.get(svg) || new Map();
  slotsBySvg.set(svg, held);
  assignSlots(
    held,
    all.filter((s) => !s.color).map((s) => s.id),
  );
  const colorOf = (s) => seriesColor(svg, s, type);
  const usable = (p) => Number.isFinite(p.v) && (kind === 'scatter' ? Number.isFinite(p.x) : Number.isFinite(timeOf(p)));
  const inRange = all.flatMap((s) => s.points).filter(usable);

  node(svg, 'text', { x: 0, y: 12, fill: 'var(--ink-3)', 'font-size': 12, 'font-weight': 600 }, label);
  svg.setAttribute(
    'aria-label',
    `${label}. ${kind === 'scatter' ? 'Scatter plot' : 'Line chart'}. Hover, tap or use the arrow keys to read values.`,
  );
  if (!series.flatMap((s) => s.points).some(usable)) {
    node(
      svg,
      'text',
      { x: 0, y: 60, fill: 'var(--ink-3)', 'font-size': 14 },
      options.empty || 'Nothing to show. Select or unhide a series.',
    );
    return;
  }

  // scales
  const [rawLo, rawHi] = extent(
    inRange.map((p) => p.v),
    probability,
    bounds,
  );
  if (rawHi <= rawLo) {
    node(svg, 'text', { x: 0, y: 60, fill: 'var(--ink-3)', 'font-size': 14 }, 'Upper bound must exceed lower bound.');
    return;
  }
  const yScale = Number.isFinite(bounds[0]) && Number.isFinite(bounds[1]) ? null : niceTicks(rawLo, rawHi, height < 340 ? 4 : 5);
  const yLo = yScale ? (probability ? Math.max(0, yScale.lo) : yScale.lo) : rawLo;
  const yHi = yScale ? (probability ? Math.min(100, yScale.hi) : yScale.hi) : rawHi;
  const yTicks = (yScale ? yScale.ticks : niceTicks(rawLo, rawHi, 5).ticks).filter((v) => v >= yLo - 1e-9 && v <= yHi + 1e-9);
  const yDecimals = decimalsFor(yScale ? yScale.step : (rawHi - rawLo) / 5);
  const fmtTick = (v) =>
    v.toLocaleString('en', { minimumFractionDigits: yDecimals, maximumFractionDigits: yDecimals }) + (probability ? '%' : '');

  let xLo = Infinity;
  let xHi = -Infinity;
  for (const p of inRange) {
    const v = kind === 'scatter' ? p.x : timeOf(p);
    xLo = Math.min(xLo, v);
    xHi = Math.max(xHi, v);
  }
  if (kind !== 'scatter' && options.xDomain) [xLo, xHi] = options.xDomain;
  if (kind !== 'scatter' && xHi === xLo) {
    xLo -= 86400000;
    xHi += 86400000;
  }
  const xScale = kind === 'scatter' ? niceTicks(xLo, xHi, 6) : null;
  if (xScale) {
    xLo = xScale.lo;
    xHi = xScale.hi;
  }

  // direct labels: only for lines that reach (nearly) the right edge
  const reaches = (s) => {
    const last = [...s.points].reverse().find(usable);
    return last && xHi - timeOf(last) <= (xHi - xLo) * 0.08;
  };
  const labelled = kind === 'line' && width >= 560 && series.length <= 6 ? series.filter(reaches) : [];
  const nameWidth = labelled.length ? Math.min(150, Math.max(...labelled.map((s) => truncate(s.name, 22).length)) * 6.6 + 24) : 0;
  const widest = Math.max(...yTicks.map((v) => fmtTick(v).length));

  // With no direct labels (narrow screens, many series) a legend inside the
  // chart keeps identity off colour alone; it wraps onto as many rows as needed.
  const legendRows = [];
  if (kind === 'line' && options.legend !== false && !labelled.length && series.length >= 2) {
    let row = [];
    let used = 0;
    for (const s of series) {
      const w = truncate(s.name, 24).length * 6.4 + 34;
      if (used + w > width && row.length) {
        legendRows.push(row);
        row = [];
        used = 0;
      }
      row.push({ s, x: used });
      used += w;
    }
    legendRows.push(row);
  }
  const box = {
    left: Math.max(34, 14 + widest * 7),
    right: width - (nameWidth || 14),
    top: 26 + (legendRows.length ? legendRows.length * 18 + 4 : 0),
    bottom: height - (kind === 'scatter' && xLabel ? 44 : 26),
  };
  const X = (v) => box.left + ((v - xLo) / (xHi - xLo)) * (box.right - box.left);
  const Y = (v) =>
    reverse
      ? box.top + ((v - yLo) / (yHi - yLo)) * (box.bottom - box.top)
      : box.bottom - ((v - yLo) / (yHi - yLo)) * (box.bottom - box.top);

  if (legendRows.length) {
    const legend = node(svg, 'g', { 'aria-hidden': 'true' });
    legendRows.forEach((row, r) => {
      for (const { s, x } of row) {
        const y = 32 + r * 18;
        node(legend, 'line', { x1: x, x2: x + 14, y1: y, y2: y, stroke: colorOf(s), 'stroke-width': 3, 'stroke-linecap': 'round' });
        node(legend, 'text', { x: x + 19, y: y + 4, fill: 'var(--ink)', 'font-size': 12, 'font-weight': 500 }, truncate(s.name, 24));
      }
    });
  }

  // axes
  const axis = node(svg, 'g', { 'aria-hidden': 'true' });
  for (const v of yTicks) {
    const y = Y(v);
    node(axis, 'line', { x1: box.left, x2: box.right, y1: y, y2: y, stroke: 'var(--grid)', 'stroke-width': 1 });
    node(axis, 'text', { x: box.left - 8, y: y + 4, fill: 'var(--ink-3)', 'font-size': 12, 'text-anchor': 'end' }, fmtTick(v));
  }
  node(axis, 'line', { x1: box.left, x2: box.right, y1: box.bottom, y2: box.bottom, stroke: 'var(--rule)', 'stroke-width': 1 });
  const xTicks =
    kind === 'scatter'
      ? xScale.ticks.map((t) => ({ t, label: Number(t.toPrecision(5)).toString() }))
      : timeTicks(xLo, xHi, Math.max(3, Math.floor((box.right - box.left) / 90)));
  // a reference line, drawn as the ratings draw their average: a solid ink line with a light halo
  const reference = options.reference;
  if (reference && reference.value >= yLo && reference.value <= yHi) {
    const y = Y(reference.value);
    node(axis, 'line', { x1: box.left, x2: box.right, y1: y, y2: y, stroke: 'var(--surface)', 'stroke-width': 3.5, opacity: 0.85 });
    node(axis, 'line', { x1: box.left, x2: box.right, y1: y, y2: y, stroke: 'var(--ink)', 'stroke-width': 1.25 });
  }
  for (const tk of xTicks) {
    node(axis, 'line', { x1: X(tk.t), x2: X(tk.t), y1: box.bottom, y2: box.bottom + 4, stroke: 'var(--rule)', 'stroke-width': 1 });
    node(axis, 'text', { x: X(tk.t), y: box.bottom + 18, fill: 'var(--ink-3)', 'font-size': 12, 'text-anchor': 'middle' }, tk.label);
  }
  if (kind === 'scatter' && xLabel)
    node(
      axis,
      'text',
      { x: (box.left + box.right) / 2, y: height - 8, fill: 'var(--ink-3)', 'font-size': 12, 'text-anchor': 'middle' },
      xLabel,
    );

  const clipId = `${svg.id || 'plot'}-bounds`;
  node(node(node(svg, 'defs'), 'clipPath', { id: clipId }), 'rect', {
    x: box.left - 4,
    y: box.top - 4,
    width: box.right - box.left + 8,
    height: box.bottom - box.top + 8,
  });
  const layer = node(svg, 'g', { 'clip-path': `url(#${clipId})` });

  if (kind === 'scatter') {
    for (const s of series) {
      for (const p of s.points.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.v))) {
        const target = node(layer, 'g');
        node(target, 'circle', { cx: X(p.x), cy: Y(p.v), r: 5, fill: colorOf(s), stroke: 'var(--surface)', 'stroke-width': 2 });
        node(target, 'circle', { cx: X(p.x), cy: Y(p.v), r: 14, fill: 'transparent', 'pointer-events': 'all' });
        inspectTarget(target, () => `${pointDescription(s, p, label)}\n${xLabel}: ${p.x}`);
      }
    }
    return;
  }

  // lines
  for (const s of series) {
    const color = colorOf(s);
    const segments = splitSegments(s.points);
    for (const group of segments) {
      const points = group.map((p) => `${X(timeOf(p)).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
      if (options.casing)
        // a thin dark edge under the line, so that a pale colour shows on a light plate
        node(layer, 'polyline', {
          points,
          fill: 'none',
          stroke: 'rgb(0 0 0 / 0.2)',
          'stroke-width': 3.8,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
          'pointer-events': 'none',
        });
      node(layer, 'polyline', {
        points,
        fill: 'none',
        stroke: color,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        'stroke-dasharray': s.dash || 'none',
        'pointer-events': 'none',
      });
    }
    const end = segments.length ? segments[segments.length - 1][segments[segments.length - 1].length - 1] : null;
    if (end) node(layer, 'circle', { cx: X(timeOf(end)), cy: Y(end.v), r: 4, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 });
  }

  // direct labels at the right edge
  if (labelled.length) {
    const ends = labelled.map((s) => ({ s, p: [...s.points].reverse().find(usable) }));
    const placed = spreadLabels(
      ends.map(({ s, p }) => ({ id: s.id, y: Y(p.v) })),
      16,
      box.top + 6,
      box.bottom - 2,
    );
    const labels = node(svg, 'g', { 'aria-hidden': 'true' });
    for (const { s, p } of ends) {
      const y = placed.get(s.id);
      const color = colorOf(s);
      const x = box.right + 10;
      if (Math.abs(y - Y(p.v)) > 3)
        node(labels, 'polyline', {
          points: `${X(timeOf(p)) + 6},${Y(p.v)} ${box.right + 4},${Y(p.v)} ${x - 2},${y}`,
          fill: 'none',
          stroke: 'var(--rule)',
          'stroke-width': 1,
        });
      node(labels, 'line', { x1: x, x2: x + 10, y1: y, y2: y, stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round' });
      node(labels, 'text', { x: x + 15, y: y + 4, fill: 'var(--ink)', 'font-size': 12, 'font-weight': 600 }, truncate(s.name, 22));
    }
  }

  // a time cursor (Head to head): a marker for each moment in use, which the visitor can drag along the chart to change them
  const cursor = options.timeCursor;
  const marks = cursor ? node(svg, 'g', { 'pointer-events': 'none' }) : null;
  if (cursor) {
    const place = (markers) => {
      marks.replaceChildren();
      markers.forEach((marker, index) => {
        // two markers at the same time stand side by side
        const x = Math.max(box.left, Math.min(box.right, X(marker.time))) + (index - (markers.length - 1) / 2) * 3;
        node(marks, 'line', { x1: x, x2: x, y1: box.top, y2: box.bottom, stroke: marker.color, 'stroke-width': 2 });
        node(marks, 'rect', {
          x: x - 4,
          y: box.top - 9,
          width: 8,
          height: 8,
          fill: marker.color,
          stroke: 'var(--surface)',
          'stroke-width': 1,
        });
      });
    };
    place(cursor.markers);
    timeCursors.set(svg, place);
  }

  // crosshair: one tooltip with every series at the nearest weekend
  const byTime = new Map();
  for (const s of series) {
    for (const p of s.points) {
      if (!usable(p)) continue;
      const t = timeOf(p);
      if (!byTime.has(t)) byTime.set(t, []);
      byTime.get(t).push({ s, p });
    }
  }
  const times = [...byTime.keys()].sort((a, b) => a - b);
  const overlay = node(svg, 'rect', {
    x: box.left,
    y: box.top,
    width: box.right - box.left,
    height: box.bottom - box.top,
    fill: 'transparent',
    'pointer-events': 'all',
  });
  overlay.style.touchAction = 'pan-y';
  svg.setAttribute('data-crosshair', 'true');
  svg.setAttribute('tabindex', '0');
  const cross = node(svg, 'g', { 'pointer-events': 'none' });
  const valueDecimals = yScale && yScale.step < 1 ? 3 : 1;
  let index = times.length - 1;
  const show = (i, clientX, clientY) => {
    if (i < 0 || !times.length) return;
    index = i;
    const t = times[i];
    const rows = byTime.get(t).sort((a, b) => (reverse ? a.p.v - b.p.v : b.p.v - a.p.v));
    cross.replaceChildren();
    node(cross, 'line', { x1: X(t), x2: X(t), y1: box.top, y2: box.bottom, stroke: 'var(--ink-3)', 'stroke-width': 1 });
    for (const { s, p } of rows)
      node(cross, 'circle', { cx: X(t), cy: Y(p.v), r: 4.5, fill: colorOf(s), stroke: 'var(--surface)', 'stroke-width': 2 });
    const tip = tipElement();
    tip.className = svg.closest('.ledger, .deck-card') ? 'rich metal' : 'rich'; // on the panel, or on a card of slides, the tooltip is in the panel's metal
    tip.replaceChildren();
    const head = document.createElement('div');
    head.className = 'tip-head';
    const extra = options.pointLabel?.(rows[0].p);
    head.textContent = `${dayFormat.format(t)}${extra ? ` · ${extra}` : ''}`;
    tip.append(head);
    for (const { s, p } of rows) {
      const row = document.createElement('div');
      row.className = 'tip-row';
      row.style.setProperty('--c', colorOf(s));
      const key = document.createElement('i');
      const value = document.createElement('b');
      value.textContent = p.v.toFixed(valueDecimals) + (probability ? '%' : '');
      const name = document.createElement('span');
      name.textContent = s.name + (p.car ? ` · ${p.car}` : '');
      row.append(key, value, name);
      tip.append(row);
    }
    tip.hidden = false;
    const rect = svg.getBoundingClientRect();
    placeTip(tip, clientX ?? rect.left + (X(t) * rect.width) / width, clientY ?? rect.top + box.top + 20);
  };
  const locate = (event) => {
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) * width) / rect.width;
    return nearestIndex(times, xLo + ((px - box.left) / (box.right - box.left)) * (xHi - xLo));
  };
  if (cursor?.onScrub) {
    // pressing on the chart and dragging sets the time; the callback is told the time (milliseconds) and the phase: start, move, end
    const timeAt = (event) => {
      const rect = svg.getBoundingClientRect();
      const px = ((event.clientX - rect.left) * width) / rect.width;
      return Math.max(xLo, Math.min(xHi, xLo + ((px - box.left) / (box.right - box.left)) * (xHi - xLo)));
    };
    overlay.style.cursor = 'ew-resize';
    overlay.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      // the moves and the release are taken on the window, not on the chart: the chart may be drawn again under the pointer (its size changes), and
      // a drag held by an element that is gone would be dropped
      dragging.add(svg);
      const move = (event) => cursor.onScrub(timeAt(event), 'move');
      const end = (event) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        dragging.delete(svg);
        cursor.onScrub(timeAt(event), 'end');
        if (Math.round(svg.getBoundingClientRect().width) !== charts.get(svg)?.width) charts.get(svg)?.redraw(); // a size change that waited
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      cursor.onScrub(timeAt(e), 'start');
    });
  }
  overlay.addEventListener('pointermove', (e) => show(locate(e), e.clientX, e.clientY));
  overlay.addEventListener('pointerdown', (e) => show(locate(e), e.clientX, e.clientY));
  overlay.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'touch') return;
    cross.replaceChildren();
    hideTooltip();
  });
  svg.addEventListener('focus', () => show(index));
  svg.addEventListener('blur', () => {
    cross.replaceChildren();
    hideTooltip();
  });
  svg.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 1;
    const next = {
      ArrowLeft: index - step,
      ArrowRight: index + step,
      Home: 0,
      End: times.length - 1,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    show(Math.max(0, Math.min(times.length - 1, next)));
  });
}

/** Moves the markers of a chart drawn with a time cursor to these moments ({ time, color }, ...), without drawing it again. */
export function moveTimeCursor(svg, markers) {
  timeCursors.get(svg)?.(markers);
}
