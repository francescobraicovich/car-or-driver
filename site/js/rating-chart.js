// The chart of one or two ratings over time, as an SVG written into the page (no script draws it): the pages of the drivers, the teams and two
// drivers (tools/driver-and-team-pages.mjs), and the head to head of any two drivers (pair-page.js), which draws it in the browser from the same
// function. A chart may carry a marker for a moment of each line: the head to head moves them (chartScale says where a date and a rating fall).
import { esc } from './utils.js';

export const CHART = { width: 760, height: 260, left: 46, right: 14, top: 14, bottom: 28 };
const GAP_DAYS = 300; // a break in the line where a driver or car missed more than this (a season; the delayed start of 2020 was 217 days)
const time = (date) => Date.parse(date);

/** Where the dates and the ratings of `series` fall on the chart: x(date) and y(rating), in the units of its viewBox, and the date at an x. */
export function chartScale(series) {
  const all = series.flatMap((entry) => entry.rows);
  const [start, end] = [Math.min(...all.map((row) => time(row.date))), Math.max(...all.map((row) => time(row.date)))];
  const low = Math.floor(Math.min(1000, ...all.map((row) => row.rating)) / 25) * 25;
  const high = Math.ceil(Math.max(1000, ...all.map((row) => row.rating)) / 25) * 25;
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  return {
    start,
    end,
    low,
    high,
    x: (date) => CHART.left + (end === start ? plotWidth / 2 : ((time(date) - start) / (end - start)) * plotWidth),
    y: (value) => CHART.top + ((high - value) / (high - low)) * plotHeight,
    timeAt: (x) => start + ((x - CHART.left) / plotWidth) * (end - start),
  };
}

/** A marker on the chart: a line across it and a dot on the rating, at `row` ({date, rating}). */
export function markerAttributes(scale, row) {
  const [x, y] = [scale.x(row.date).toFixed(1), scale.y(row.rating).toFixed(1)];
  return { x, y };
}

/**
 * An SVG chart of one or two ratings over time, with the level of the leading field (1000).
 * @param {{label: string, rows: {date: string, rating: number}[]}[]} series
 * @param {string} title  what the chart shows, for screen readers
 * @param {'driver'|'car'|'pair'} kind  whose: a driver's line is blue, a car's red, and of two drivers the first red and the second blue
 * @param {{date: string, rating: number}[]} [markers] a moment of each line, marked
 */
export function ratingChart(series, title, kind, markers = []) {
  const scale = chartScale(series);
  const { start, end, low, high } = scale;
  const x = (date) => scale.x(date).toFixed(1);
  const y = (value) => scale.y(value).toFixed(1);
  const runs = (rows) => {
    const parts = [[]];
    rows.forEach((row, index) => {
      if (index && time(row.date) - time(rows[index - 1].date) > GAP_DAYS * 864e5) parts.push([]);
      parts.at(-1).push(row);
    });
    return parts;
  };
  const step = high - low > 300 ? 100 : high - low > 120 ? 50 : 25;
  const ticks = [];
  for (let value = low; value <= high; value += step) ticks.push(value);
  const [firstYear, lastYear] = [new Date(start).getUTCFullYear(), new Date(end).getUTCFullYear()];
  const yearStep = Math.max(1, Math.ceil((lastYear - firstYear + 1) / 8));
  const years = [];
  for (let year = firstYear; year <= lastYear; year += yearStep) years.push(year);
  const yearX = (year) => x(new Date(Math.max(start, Math.min(end, time(`${year}-01-01`)))).toISOString().slice(0, 10));
  const drawn = series
    .map((entry, index) =>
      runs(entry.rows)
        .map((run) =>
          run.length === 1
            ? `<circle class="chart-point chart-series-${index + 1}" cx="${x(run[0].date)}" cy="${y(run[0].rating)}" r="3" />`
            : `<polyline class="chart-line chart-series-${index + 1}" points="${run.map((row) => `${x(row.date)},${y(row.rating)}`).join(' ')}" />`,
        )
        .join(''),
    )
    .join('');
  const marked = markers
    .map((row, index) => {
      if (!row) return '';
      const at = markerAttributes(scale, row);
      return `<g class="chart-marker chart-series-${index + 1}" data-series="${index}" transform="translate(${at.x} 0)"><line x1="0" x2="0" y1="${CHART.top}" y2="${CHART.height - CHART.bottom}" /><circle cx="0" cy="${at.y}" r="5.5" /></g>`;
    })
    .join('');
  const legend =
    series.length > 1
      ? `<p class="chart-legend">${series.map((entry, index) => `<span class="chart-key chart-series-${index + 1}">${esc(entry.label)}</span>`).join('')}</p>`
      : '';
  return `<figure class="rating-chart rating-chart-${kind}">
  <svg viewBox="0 0 ${CHART.width} ${CHART.height}" role="img" aria-label="${esc(title)}" preserveAspectRatio="xMidYMid meet">
    ${ticks.map((value) => `<line class="chart-grid${value === 1000 ? ' chart-field' : ''}" x1="${CHART.left}" x2="${CHART.width - CHART.right}" y1="${y(value)}" y2="${y(value)}" /><text class="chart-tick" x="${CHART.left - 8}" y="${y(value)}" text-anchor="end" dominant-baseline="middle">${value}</text>`).join('')}
    ${years.map((year) => `<text class="chart-tick" x="${yearX(year)}" y="${CHART.height - 8}" text-anchor="middle">${year}</text>`).join('')}
    ${drawn}${marked}
  </svg>
  ${legend}<figcaption>1000, the dashed line, is the level of the leading field.</figcaption>
</figure>`;
}
