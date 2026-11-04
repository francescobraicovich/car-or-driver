// Figures for the Methodology page that explain the method itself: the odds curve, how an error bar behaves as a driver's career grows, and one
// rating drawn with its error band. Each is drawn with the chart toolkit of the Insights page, at the width of its container.
import { createSvgElement, drawAxes, drawLines, drawText, formatInteger, mountChart } from './insights-charts.js';

const heightFor = (width) => (width < 520 ? 240 : 300);
const percent = (value) => `${formatInteger(value)}%`;
const signedInteger = (value) => (value > 0 ? `+${formatInteger(value)}` : value < 0 ? `−${formatInteger(-value)}` : '0');

/** A filled band between two curves, drawn behind the lines. */
function drawBand(svg, axes, points, { fill, opacity = 0.18 }) {
  const upper = points.map(([x, , high]) => `${axes.x(x)},${axes.y(high)}`);
  const lower = points.map(([x, low]) => `${axes.x(x)},${axes.y(low)}`).reverse();
  svg.append(createSvgElement('polygon', { points: [...upper, ...lower].join(' '), fill, 'fill-opacity': opacity }));
}

/** The probability that the stronger entry finishes ahead, against the rating gap: the odds formula of Part 3. */
export function drawOddsCurve(container, scale) {
  const gaps = Array.from({ length: 61 }, (_, i) => -300 + i * 10);
  const probability = (gap) => 100 / (1 + 10 ** (-gap / scale));
  mountChart(
    container,
    (svg, width, height) => {
      const axes = drawLines(svg, width, height, {
        xDomain: [-300, 300],
        yDomain: [0, 108], // headroom above the top tick for the axis title
        xTicks: [-300, -150, 0, 150, 300],
        yTicks: [0, 25, 50, 75, 100],
        xFormat: signedInteger,
        yFormat: percent,
        xTitle: 'Rating gap: the first entry’s rating minus the second’s',
        yTitle: 'Chance that the first finishes ahead',
        marginLeft: 48,
        series: [{ color: 'var(--s1)', width: 2.5, points: gaps.map((gap) => [gap, probability(gap)]) }],
      });
      for (const gap of [-2 * scale, -scale, scale, 2 * scale]) {
        svg.append(
          createSvgElement('circle', {
            cx: axes.x(gap),
            cy: axes.y(probability(gap)),
            r: 4.5,
            fill: 'var(--s1)',
            stroke: 'var(--surface)',
            'stroke-width': 1.5,
          }),
        );
        const text = `${signedInteger(gap)} points: ${probability(gap).toFixed(0)}%`;
        // below and to the right of the upper points, above and to the left of the lower ones: the side the curve is not on
        drawText(svg, axes.x(gap) + (gap > 0 ? 9 : -9), axes.y(probability(gap)) + (gap > 0 ? 16 : -9), text, {
          anchor: gap > 0 ? 'start' : 'end',
          className: 'secondary',
        });
      }
    },
    heightFor,
  );
}

const percentile = (sorted, share) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];

/** The width of the error bar of a driver's rating against the number of races they have driven. */
export function drawUncertaintyByExperience(container, model) {
  const LAST_RACE_COUNT = 60;
  const byRaces = new Map();
  for (const snap of model.snaps)
    for (const row of snap.drivers) {
      if (!Number.isFinite(row.raceSd) || row.races < 1 || row.races > LAST_RACE_COUNT) continue;
      if (!byRaces.has(row.races)) byRaces.set(row.races, []);
      byRaces.get(row.races).push(row.raceSd);
    }
  const points = [...byRaces]
    .filter(([, values]) => values.length >= 20)
    .sort((a, b) => a[0] - b[0])
    .map(([races, values]) => {
      const sorted = values.slice().sort((a, b) => a - b);
      return [races, percentile(sorted, 0.1), percentile(sorted, 0.9), sorted.reduce((sum, value) => sum + value, 0) / sorted.length];
    });
  const minimum = Math.floor(Math.min(...points.map((point) => point[1]), 0) / 5) * 5;
  const maximum = Math.max(5, Math.ceil(Math.max(...points.map((point) => point[2]), 0) / 5) * 5);
  const ticks = Array.from({ length: (maximum - minimum) / 5 + 1 }, (_, index) => minimum + index * 5);
  mountChart(
    container,
    (svg, width, height) => {
      const axes = drawAxes(svg, width, height, {
        xDomain: [1, LAST_RACE_COUNT],
        yDomain: [minimum, maximum + (maximum - minimum) * 0.08],
        xTicks: [1, 10, 20, 30, 40, 50, 60],
        yTicks: ticks,
        xTitle: 'Races driven so far',
        yTitle: 'Race rating: approximate filter standard deviation, in points',
        marginLeft: 40,
      });
      drawBand(
        svg,
        axes,
        points.map(([races, low, high]) => [races, low, high]),
        { fill: 'var(--s1)' },
      );
      svg.append(
        createSvgElement('polyline', {
          points: points.map(([races, , , mean]) => `${axes.x(races)},${axes.y(mean)}`).join(' '),
          fill: 'none',
          stroke: 'var(--s1)',
          'stroke-width': 2.5,
          'stroke-linejoin': 'round',
        }),
      );
    },
    heightFor,
  );
}

const fractionalYear = (isoDate) => {
  const date = new Date(isoDate);
  return date.getUTCFullYear() + (date.getUTCMonth() + date.getUTCDate() / 31) / 12;
};

/** One driver's published rating after each recent weekend, with approximate filter uncertainty. */
export function drawRatingThroughTime(container, model) {
  const WEEKENDS = 48;
  const latest = model.snaps.at(-1);
  const subject = latest.drivers.filter((row) => row.races >= 100 && Number.isFinite(row.race)).sort((a, b) => b.race - a.race)[0];
  if (!subject) return null;
  const history = model.dh
    .get(String(subject.driverId))
    .filter((point) => Number.isFinite(point.race) && Number.isFinite(point.raceSd))
    .slice(-WEEKENDS);
  const points = history.map((point) => [fractionalYear(point.date), point.race - point.raceSd, point.race + point.raceSd, point.race]);
  const lows = points.map((point) => point[1]);
  const highs = points.map((point) => point[2]);
  const floor = Math.floor(Math.min(...lows) / 20) * 20;
  const ceiling = Math.ceil(Math.max(...highs) / 20) * 20;
  const ticksOf = (from, to, step) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
  const firstYear = Math.ceil(points[0][0]);
  mountChart(
    container,
    (svg, width, height) => {
      const axes = drawAxes(svg, width, height, {
        xDomain: [points[0][0], points.at(-1)[0]],
        yDomain: [floor, ceiling + 8],
        xTicks: ticksOf(firstYear, Math.floor(points.at(-1)[0]), 1),
        yTicks: ticksOf(floor, ceiling, 20),
        yTitle: 'Race rating (1,000 = the field’s average)',
        marginLeft: 52,
      });
      drawBand(
        svg,
        axes,
        points.map(([year, low, high]) => [year, low, high]),
        { fill: 'var(--s2)' },
      );
      svg.append(
        createSvgElement('polyline', {
          points: points.map(([year, , , rating]) => `${axes.x(year)},${axes.y(rating)}`).join(' '),
          fill: 'none',
          stroke: 'var(--s2)',
          'stroke-width': 2.5,
          'stroke-linejoin': 'round',
        }),
      );
    },
    heightFor,
  );
  return subject.name;
}
