// Figures of the Methodology that show the model at work: the odds curve of overall strength, one career drawn as the driver's overall rating
// beside the overall ratings of the cars they drove, and the forecast score of every season. Each is drawn with the chart toolkit of the
// Insights page, at the width of its container.
import { createSvgElement, drawAxes, drawLines, drawText, formatInteger, mountChart } from './insights-charts.js';
import { summarizeBacktest } from '../../packages/core/src/backtest.js';

const heightFor = (width) => (width < 520 ? 240 : 300);
const percent = (value) => `${formatInteger(value)}%`;
const signedInteger = (value) => (value > 0 ? `+${formatInteger(value)}` : value < 0 ? `−${formatInteger(-value)}` : '0');
const COIN_FLIP = Math.LN2; // the log loss of a forecast that gives every pair 50%

/** The probability that the entry with the higher overall strength finishes ahead, against the gap in points (`scale` points are 10-to-1). */
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
        xTitle: 'Gap in overall strength: the first entry’s rating minus the second’s',
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

const fractionalYear = (isoDate) => {
  const date = new Date(isoDate);
  return date.getUTCFullYear() + (date.getUTCMonth() + date.getUTCDate() / 31) / 12;
};
const ticksOf = (from, to, step) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

// Lewis Hamilton: one long career in three clear stints (McLaren, Mercedes, Ferrari). If the history lacks him, the longest career is shown.
const CAREER_DRIVER = '1';

/** One career on the published historical ratings (`model` is the display model): the driver's overall rating, and the overall rating of
 * the car they drove at each weekend. The driver's line runs on through every team change; the car's line jumps to the new car. */
export function drawCareerAcrossTeams(container, model) {
  const id = model.dh.has(CAREER_DRIVER)
    ? CAREER_DRIVER
    : [...model.dh.keys()].sort((a, b) => model.dh.get(b).length - model.dh.get(a).length)[0];
  const history = (model.dh.get(id) ?? []).filter((point) => Number.isFinite(point.overall));
  if (history.length < 2) return null;
  const carRating = new Map();
  for (const [carId, rows] of model.ch) for (const row of rows) carRating.set(`${carId}|${row.raceId}`, row.overall);
  const points = history.map((point) => ({
    year: fractionalYear(point.date),
    driver: point.overall,
    car: carRating.get(`${point.constructorId}|${point.raceId}`),
    team: point.car,
  }));
  const stints = [];
  for (const point of points) {
    if (stints.at(-1)?.team !== point.team) stints.push({ team: point.team, points: [] });
    stints.at(-1).points.push(point);
  }
  const values = points.flatMap((point) => [point.driver, point.car]).filter(Number.isFinite);
  const floor = Math.floor(Math.min(...values) / 20) * 20;
  const ceiling = Math.ceil(Math.max(...values) / 20) * 20;
  const [first, last] = [points[0].year, points.at(-1).year];
  mountChart(
    container,
    (svg, width, height) => {
      const step = width < 520 ? 4 : 2;
      const axes = drawAxes(svg, width, height, {
        xDomain: [first, last],
        yDomain: [floor, ceiling + 16], // room above the top tick for the names of the teams
        xTicks: ticksOf(Math.ceil(first / step) * step, Math.floor(last), step),
        yTicks: ticksOf(floor, ceiling, 20),
        yTitle: 'Overall strength (1,000 = the recent field)',
        marginLeft: 52,
      });
      const line = (stintPoints, key, color, strokeWidth) =>
        createSvgElement('polyline', {
          points: stintPoints
            .filter((point) => Number.isFinite(point[key]))
            .map((point) => `${axes.x(point.year)},${axes.y(point[key])}`)
            .join(' '),
          fill: 'none',
          stroke: color,
          'stroke-width': strokeWidth,
          'stroke-linejoin': 'round',
        });
      for (const [index, stint] of stints.entries()) {
        const start = stint.points[0].year;
        if (index > 0)
          svg.append(
            createSvgElement('line', {
              x1: axes.x(start),
              x2: axes.x(start),
              y1: axes.top,
              y2: axes.y(floor),
              class: 'gridline',
              'stroke-dasharray': '3 3',
            }),
          );
        const end = stint.points.at(-1).year;
        drawText(svg, axes.x((start + end) / 2), axes.y(ceiling + 8), stint.team, { anchor: 'middle', className: 'secondary' });
        svg.append(line(stint.points, 'car', 'var(--s1)', 1.5)); // thinner: the car changes weekly, the driver's line is the subject
      }
      svg.append(line(points, 'driver', 'var(--s2)', 2.5));
    },
    heightFor,
  );
  return history.at(-1).name;
}

/** The forecast score of every season from 2008, the first season scored, against a coin flip; lower is better. */
export function drawSeasonScores(container, model) {
  const seasons = summarizeBacktest(model, { fromYear: 2008, burnIn: 0 })
    .seasons.filter((season) => Number.isFinite(season.raceLogLoss))
    .map((season) => [season.year, season.raceLogLoss]);
  if (!seasons.length) return;
  const [first, last] = [seasons[0][0], seasons.at(-1)[0]];
  mountChart(
    container,
    (svg, width, height) => {
      const step = width < 520 ? 4 : 2;
      drawLines(svg, width, height, {
        xDomain: [first - 0.5, last + 0.5],
        yDomain: [0.4, 0.75],
        xTicks: ticksOf(Math.ceil(first / step) * step, last, step),
        yTicks: [0.4, 0.5, 0.6, 0.7],
        yFormat: (value) => value.toFixed(1),
        yTitle: 'Log loss of the race forecasts (lower is better)',
        marginLeft: 40,
        series: [
          {
            name: 'Coin flip',
            color: 'var(--ink-3)',
            width: 1.5,
            points: [
              [first - 0.5, COIN_FLIP],
              [last + 0.5, COIN_FLIP],
            ],
            label: 'coin flip',
            labelOffset: -8,
          },
          { name: 'Forecasts', color: 'var(--s1)', width: 2.5, points: seasons, label: 'forecasts', labelOffset: 16 },
        ],
      });
    },
    heightFor,
  );
}
