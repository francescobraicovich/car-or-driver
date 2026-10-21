// Small SVG chart toolkit for the Insights page: axes, lines, horizontal bars, scatter plots, legends and tables.
// Colours and text come from the page's CSS variables, so the charts follow the light and dark themes. Every chart is drawn at the pixel
// width of its container and redrawn when that width changes.

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export const SERIES_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s7)'];

export const formatInteger = (value) => Math.round(value).toString();
export const formatOneDecimal = (value) => value.toFixed(1);
export const formatSigned = (value) => (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(Math.round(value));
export const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
export const surname = (name) => name.split(' ').slice(-1)[0];

export function createSvgElement(tag, attributes = {}, children = []) {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  for (const child of [].concat(children)) if (child != null) element.append(child.nodeType ? child : document.createTextNode(child));
  return element;
}

export const linearScale = (domainStart, domainEnd, rangeStart, rangeEnd) => (value) =>
  rangeStart + ((value - domainStart) / (domainEnd - domainStart)) * (rangeEnd - rangeStart);

/**
 * Draws into `container` with `draw(svg, width, height)`, and again whenever the container's width changes. A chart that takes its height from the
 * pixels it is given (lines, scatter plots, axes) is drawn again taller, up to one and a half times its own height, if the box it is in has room to
 * grow (on a slide, where the style sheet lets the box of the main chart grow into what is free). Horizontal bars set their own height from their rows
 * and say so (`data-fixed`): they stay as they are.
 */
export function mountChart(container, draw, heightFor) {
  let drawnWidth = -1;
  let drawnHeight = -1;
  let stretchable = null; // not known until the chart has been drawn once
  const render = () => {
    const width = Math.floor(container.clientWidth);
    if (width < 1) return;
    const style = getComputedStyle(container);
    const room = Math.floor(container.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
    const own = heightFor(width);
    const height = stretchable ? Math.round(Math.min(1.5 * own, Math.max(own, room))) : own;
    if (width === drawnWidth && height <= drawnHeight + 4) return;
    drawnWidth = width;
    drawnHeight = height;
    const svg = createSvgElement('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' });
    container.replaceChildren(svg);
    draw(svg, width, height);
    stretchable ??= svg.dataset.fixed !== 'true';
  };
  render();
  new ResizeObserver(render).observe(container);
}

export function drawText(svg, x, y, content, { anchor = 'start', className = '', baseline = 'auto' } = {}) {
  svg.append(createSvgElement('text', { x, y, 'text-anchor': anchor, class: className, 'dominant-baseline': baseline }, content));
}

/** Gridlines, tick labels and axis titles; returns the pixel scales and margins. */
export function drawAxes(svg, width, height, options) {
  const left = options.marginLeft ?? 44;
  const right = options.marginRight ?? 14;
  const top = options.marginTop ?? (options.yTitle ? 24 : 10);
  const bottom = options.marginBottom ?? 34;
  const x = linearScale(options.xDomain[0], options.xDomain[1], left, width - right);
  const y = linearScale(options.yDomain[0], options.yDomain[1], height - bottom, top);
  for (const tick of options.yTicks) {
    const isZero = tick === 0 && options.yDomain[0] < 0;
    svg.append(createSvgElement('line', { x1: left, x2: width - right, y1: y(tick), y2: y(tick), class: isZero ? 'zero' : 'gridline' }));
    drawText(svg, left - 6, y(tick), (options.yFormat || formatInteger)(tick), { anchor: 'end', baseline: 'middle' });
  }
  if (!options.hideXTicks) {
    for (const tick of options.xTicks) {
      if (options.xGridlines)
        svg.append(createSvgElement('line', { x1: x(tick), x2: x(tick), y1: top, y2: height - bottom, class: 'gridline' }));
      drawText(svg, x(tick), height - bottom + 16, (options.xFormat || formatInteger)(tick), { anchor: 'middle' });
    }
  }
  if (options.xTitle) drawText(svg, (left + width - right) / 2, height - 4, options.xTitle, { anchor: 'middle', className: 'secondary' });
  if (options.yTitle) drawText(svg, 4, top - 1, options.yTitle, { className: 'secondary' });
  return { x, y, left, right, top, bottom };
}

export function drawLines(svg, width, height, options) {
  const axes = drawAxes(svg, width, height, options);
  for (const series of options.series) {
    const points = series.points.filter((point) => point[1] != null);
    svg.append(
      createSvgElement('polyline', {
        points: points.map((point) => `${axes.x(point[0])},${axes.y(point[1])}`).join(' '),
        fill: 'none',
        stroke: series.color,
        'stroke-width': series.width || 2,
        'stroke-linejoin': 'round',
      }),
    );
    if (series.markers) {
      for (const point of points) {
        svg.append(
          createSvgElement(
            'circle',
            { cx: axes.x(point[0]), cy: axes.y(point[1]), r: 3, fill: series.color, stroke: 'var(--surface)', 'stroke-width': 1.5 },
            [
              createSvgElement(
                'title',
                {},
                `${series.name}, ${(options.xFormat || formatInteger)(point[0])}: ${formatOneDecimal(point[1])}`,
              ),
            ],
          ),
        );
      }
    }
    if (series.label) {
      const last = points[points.length - 1];
      const nearRightEdge = axes.x(last[0]) + 6 > width - 60;
      drawText(svg, nearRightEdge ? width - 2 : axes.x(last[0]) + 6, axes.y(last[1]) + (series.labelOffset || 0), series.label, {
        anchor: nearRightEdge ? 'end' : 'start',
        baseline: 'middle',
        className: 'secondary',
      });
    }
  }
  for (const note of options.notes || [])
    drawText(svg, axes.x(note.x), axes.y(note.y) + (note.offset ?? -8), note.text, { anchor: 'middle', className: 'secondary' });
  return axes;
}

/**
 * Horizontal bars, one row per item. A row holds stacked segments (`segments`, positive and negative values stack away from zero) or
 * grouped bars (`bars`). `baseline` is where bars start (zero unless the axis does not reach zero).
 */
export function drawHorizontalBars(svg, width, items, options) {
  svg.dataset.fixed = 'true'; // its height is that of its rows (see mountChart)
  const rowHeight = options.rowHeight || 22;
  const left = options.marginLeft || 150;
  const right = options.marginRight || 46;
  const top = 6;
  const baseline = options.baseline ?? 0;
  const format = options.format || formatOneDecimal;
  const negativeExtent = (item) =>
    item.segments ? item.segments.filter((s) => s.value < 0).reduce((a, s) => a + s.value, 0) : Math.min(...item.bars.map((b) => b.value));
  const positiveExtent = (item) =>
    item.segments ? item.segments.filter((s) => s.value > 0).reduce((a, s) => a + s.value, 0) : Math.max(...item.bars.map((b) => b.value));
  const minimum = options.minimum ?? Math.min(0, ...items.map(negativeExtent));
  const maximum = options.maximum ?? Math.max(...items.map(positiveExtent));
  const x = linearScale(minimum, maximum, left, width - right);
  const bottom = top + items.length * rowHeight;
  for (const tick of options.ticks || []) {
    svg.append(createSvgElement('line', { x1: x(tick), x2: x(tick), y1: top, y2: bottom, class: tick === baseline ? 'zero' : 'gridline' }));
    drawText(svg, x(tick), bottom + 14, (options.tickFormat || formatInteger)(tick), { anchor: 'middle' });
  }
  items.forEach((item, index) => {
    const rowTop = top + index * rowHeight;
    drawText(svg, left - 8, rowTop + rowHeight / 2, item.label, { anchor: 'end', baseline: 'middle', className: 'secondary' });
    if (item.segments) {
      let positive = baseline;
      let negative = baseline;
      for (const segment of item.segments) {
        const start = segment.value >= 0 ? positive : negative + segment.value;
        const end = segment.value >= 0 ? positive + segment.value : negative;
        svg.append(
          createSvgElement(
            'rect',
            {
              x: x(start) + 0.5,
              y: rowTop + 3,
              width: Math.max(0, x(end) - x(start) - 1),
              height: rowHeight - 6,
              fill: segment.color,
              rx: 2,
            },
            [createSvgElement('title', {}, `${item.label}: ${segment.name} ${format(segment.value)}`)],
          ),
        );
        if (segment.value >= 0) positive += segment.value;
        else negative += segment.value;
      }
      if (item.total != null) {
        svg.append(
          createSvgElement('circle', {
            cx: x(item.total),
            cy: rowTop + rowHeight / 2,
            r: 3.2,
            fill: 'var(--ink)',
            stroke: 'var(--surface)',
            'stroke-width': 1.5,
          }),
        );
      }
      return;
    }
    const barHeight = (rowHeight - 6) / item.bars.length;
    item.bars.forEach((bar, barIndex) => {
      const barTop = rowTop + 3 + barIndex * barHeight;
      const start = Math.min(baseline, bar.value);
      const end = Math.max(baseline, bar.value);
      svg.append(
        createSvgElement(
          'rect',
          { x: x(start), y: barTop, width: Math.max(1, x(end) - x(start)), height: barHeight - 1, fill: bar.color, rx: 2 },
          [createSvgElement('title', {}, `${item.label}: ${bar.name} ${format(bar.value)}`)],
        ),
      );
      const error = bar.error || 0;
      if (error) {
        svg.append(
          createSvgElement('line', {
            x1: x(bar.value - error),
            x2: x(bar.value + error),
            y1: barTop + barHeight / 2,
            y2: barTop + barHeight / 2,
            stroke: 'var(--ink)',
            'stroke-width': 1.2,
          }),
        );
      }
      const positiveBar = bar.value >= baseline;
      drawText(
        svg,
        positiveBar ? x(bar.value + error) + 5 : x(bar.value - error) - 5,
        barTop + barHeight / 2,
        bar.text ?? format(bar.value),
        {
          anchor: positiveBar ? 'start' : 'end',
          baseline: 'middle',
          className: 'secondary',
        },
      );
    });
  });
}

export const horizontalBarsHeight = (rowCount, rowHeight = 22) => 6 + rowCount * rowHeight + 22;

/** Points with greedy, collision-free labels (highest `priority` first); `guides` are dashed [x1, y1, x2, y2] lines in data units. */
export function drawScatter(svg, width, height, options) {
  const axes = drawAxes(svg, width, height, options);
  for (const guide of options.guides || []) {
    svg.append(
      createSvgElement('line', {
        x1: axes.x(guide[0]),
        y1: axes.y(guide[1]),
        x2: axes.x(guide[2]),
        y2: axes.y(guide[3]),
        stroke: 'var(--rule)',
        'stroke-dasharray': '4 4',
      }),
    );
  }
  for (const point of options.points) {
    svg.append(
      createSvgElement(
        'circle',
        {
          cx: axes.x(point.x),
          cy: axes.y(point.y),
          r: point.radius || options.radius || 4,
          fill: point.color || options.color || 'var(--s1)',
          'fill-opacity': point.opacity ?? 0.8,
          stroke: 'var(--surface)',
          'stroke-width': 1,
        },
        [createSvgElement('title', {}, point.tooltip || point.label || '')],
      ),
    );
  }
  const placed = [];
  for (const point of options.points.filter((p) => p.label).sort((a, b) => (b.priority || 0) - (a.priority || 0))) {
    const labelWidth = point.label.length * 6.1;
    const pointX = axes.x(point.x);
    const pointY = axes.y(point.y);
    const toTheRight = pointX + 7 + labelWidth < width - 4;
    const boxX = toTheRight ? pointX + 7 : pointX - 7 - labelWidth;
    const boxY = pointY - 6;
    if (placed.some((box) => boxX < box[0] + box[2] && boxX + labelWidth > box[0] && boxY < box[1] + 12 && boxY + 12 > box[1])) continue;
    placed.push([boxX, boxY, labelWidth]);
    drawText(svg, toTheRight ? pointX + 7 : pointX - 7, pointY, point.label, {
      anchor: toTheRight ? 'start' : 'end',
      baseline: 'middle',
      className: 'secondary',
    });
  }
  return axes;
}

export const legendHtml = (entries) =>
  `<div class="insight-legend">${entries.map(([color, text]) => `<span><i style="background:${color}"></i>${text}</span>`).join('')}</div>`;

export function tableHtml(headings, rows, rightAligned = []) {
  const cell = (tag, content, index) => `<${tag}${rightAligned.includes(index) ? ' class="right"' : ''}>${content}</${tag}>`;
  const head = headings.map((heading, index) => cell('th', heading, index)).join('');
  const body = rows.map((row) => `<tr>${row.map((content, index) => cell('td', content, index)).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table class="insight-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
