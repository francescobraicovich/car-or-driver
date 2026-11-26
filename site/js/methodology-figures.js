// Figures of the Methodology that show the model at work: the odds curve of overall strength, one career drawn as the driver's overall rating
// beside the overall ratings of the cars they drove, the uncertainty of a driver and of their car over time, the pull of one timing comparison,
// one weekend's changes against the uncertainty before it, one career in the chronological and the historical run, the calibration of the
// race forecasts and the forecast score of every season. Each is drawn with the chart toolkit of the Insights page, at the width of its
// container. Drivers are drawn in --s2 and cars in --s1, as in the career figure, and every line or bar carries a text label as well.
import { createSvgElement, drawAxes, drawLines, drawScatter, drawText, formatInteger, linearScale, mountChart } from './insights-charts.js';
import { summarizeBacktest } from '../../packages/core/src/backtest.js';

const heightFor = (width) => (width < 520 ? 240 : 300);
const percent = (value) => `${formatInteger(value)}%`;
const signedInteger = (value) => (value > 0 ? `+${formatInteger(value)}` : value < 0 ? `−${formatInteger(-value)}` : '0');
const COIN_FLIP = Math.LN2; // the log loss of a forecast that gives every pair 50%
// An axis title in full where the chart is wide enough for it (about 6.2 pixels a character), and its short form on a phone.
const titleFor = (width, full, short) => (full.length * 6.2 < width - 24 ? full : short);

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
        xTitle: titleFor(width, 'Gap in overall strength: the first entry’s rating minus the second’s', 'Gap in overall strength (points)'),
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
        const text = `${signedInteger(gap)}${width < 420 ? '' : ' points'}: ${probability(gap).toFixed(0)}%`;
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
        yTitle: titleFor(width, 'Log loss of the race forecasts (lower is better)', 'Log loss (lower is better)'),
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

const DRIVER_STEP_POINTS = 8; // the change of a driver per square-root year (packages/core/python/unified_model.py)
const CAR_STEP_POINTS = 6; // the change of a car for each weekend it races
const CAR_WINTER_POINTS = 30; // the change of every car at the first race of a new year
const signedOneDecimal = (value) => (value > 0 ? `+${value.toFixed(1)}` : value < 0 ? `−${(-value).toFixed(1)}` : '0.0');
const ofDriver = (snap, id) => snap.drivers.find((row) => row.driverId === id);
const ofCar = (snap, id) => snap.cars.find((row) => row.carId === id);

/** The uncertainty (±1 standard deviation) of one driver's overall strength and of one car's, after every weekend from `fromYear`, in the
 * chronological run (`model` is the loaded filtered model). Each season is a line of its own, so the jump at its first race shows. */
export function drawUncertaintyOverTime(container, model, { driverId = '844', carId = '6', fromYear = 2019 } = {}) {
  const snaps = model.snaps.filter((snap) => snap.year >= fromYear);
  const seasons = (rowOf) => {
    const lines = new Map();
    for (const snap of snaps) {
      const row = rowOf(snap);
      if (!Number.isFinite(row?.overallSd)) continue;
      if (!lines.has(snap.year)) lines.set(snap.year, []);
      lines.get(snap.year).push([fractionalYear(snap.date), row.overallSd]);
    }
    return [...lines.values()];
  };
  const driverLines = seasons((snap) => ofDriver(snap, driverId));
  const carLines = seasons((snap) => ofCar(snap, carId));
  if (!driverLines.length || !carLines.length) return;
  const driverName = snaps.map((snap) => ofDriver(snap, driverId)).findLast(Boolean).name;
  const carName = snaps.map((snap) => ofCar(snap, carId)).findLast(Boolean).name;
  const ceiling = Math.ceil(Math.max(...carLines.flat().map((point) => point[1])) / 10) * 10;
  const [first, last] = [driverLines[0][0][0], driverLines.at(-1).at(-1)[0]];
  mountChart(
    container,
    (svg, width, height) => {
      const step = width < 520 ? 2 : 1;
      const series = (lines, color, label) =>
        lines.map((points, index) => ({
          color,
          width: 2,
          points,
          label: index === lines.length - 1 ? label : undefined,
          labelOffset: -10,
        }));
      drawLines(svg, width, height, {
        xDomain: [Math.floor(first), last + 0.15],
        yDomain: [0, ceiling + 8],
        xTicks: ticksOf(Math.floor(first), Math.floor(last), step),
        yTicks: ticksOf(0, ceiling, 10),
        yFormat: (value) => `±${value}`,
        yTitle: 'Uncertainty of overall strength (points)',
        marginLeft: 44,
        marginRight: 16,
        series: [...series(carLines, 'var(--s1)', `${carName} car`), ...series(driverLines, 'var(--s2)', driverName)],
      });
    },
    heightFor,
  );
}

/** How strongly one timing comparison pulls the estimate, against the miss (observed gap minus forecast gap, in percent of a lap), for the
 * logistic error the model uses and for a bell curve that pulls the same for small misses. `scale` is the logistic scale in internal units
 * (0.3% of a lap); 1 on the vertical axis is the largest pull of the logistic error. */
export function drawMissPull(container, scale) {
  const width = scale * 0.3; // the scale in percent of a lap
  const misses = Array.from({ length: 121 }, (_, i) => -3 + i * 0.05);
  const logistic = misses.map((miss) => [miss, Math.tanh(miss / (2 * width))]);
  const bell = misses.filter((miss) => Math.abs(miss / (2 * width)) <= 2).map((miss) => [miss, miss / (2 * width)]);
  mountChart(
    container,
    (svg, chartWidth, height) =>
      drawLines(svg, chartWidth, height, {
        xDomain: [-3, 3],
        yDomain: [-2.2, 2.2],
        xTicks: [-3, -2, -1, 0, 1, 2, 3],
        yTicks: [-2, -1, 0, 1, 2],
        xFormat: (value) => `${signedInteger(value)}%`,
        yFormat: (value) => (value === 0 ? '0' : signedInteger(value)),
        xTitle: titleFor(chartWidth, 'Miss: observed gap minus forecast gap, in percent of a lap', 'Miss, in percent of a lap'),
        yTitle: 'Pull on the estimate',
        marginLeft: 40,
        series: [
          { color: 'var(--ink-3)', width: 1.5, points: bell, label: 'bell curve', labelOffset: 12 },
          { color: 'var(--s2)', width: 2.5, points: logistic, label: 'logistic error (used)', labelOffset: -12 },
        ],
      }),
    heightFor,
  );
}

/** One weekend of the chronological run: for each driver of a team and for its car, the change in overall strength over the weekend (the
 * bar), against the uncertainty before it (the band, ±1 standard deviation, with the change since the previous weekend added). */
export function drawWeekendChange(
  container,
  model,
  { year = 2026, name = 'Las Vegas Grand Prix', carId = '6', driverIds = ['1', '844'] } = {},
) {
  const index = model.snaps.findIndex((snap) => snap.year === year && snap.name === name);
  if (index < 1) return;
  const [before, after] = [model.snaps[index - 1], model.snaps[index]];
  const years = (Date.parse(after.date) - Date.parse(before.date)) / (365.25 * 86400000);
  const carStep = CAR_STEP_POINTS ** 2 + (after.year !== before.year ? CAR_WINTER_POINTS ** 2 : 0);
  const rows = [
    ...driverIds.map((id) => [ofDriver(before, id), ofDriver(after, id), DRIVER_STEP_POINTS ** 2 * years, 'var(--s2)', '']),
    [ofCar(before, carId), ofCar(after, carId), carStep, 'var(--s1)', ' car'],
  ];
  if (rows.some(([start, end]) => !start || !end)) return;
  const items = rows.map(([start, end, step, color, suffix]) => ({
    label: `${end.name}${suffix}`,
    shortLabel: suffix ? `${end.name}${suffix}` : end.name.split(' ').at(-1),
    change: end.overall - start.overall,
    band: Math.sqrt(start.overallSd ** 2 + step),
    color,
  }));
  const extent = Math.ceil(Math.max(...items.map((item) => item.band)) / 10) * 10;
  const rowHeight = 38;
  mountChart(
    container,
    (svg, width) => {
      svg.dataset.fixed = 'true'; // its height is that of its rows
      const narrow = width < 420;
      const left = narrow ? 84 : Math.min(130, width * 0.34);
      const right = width - 14;
      const top = 6;
      const bottom = top + items.length * rowHeight;
      const x = linearScale(-extent, extent, left, right);
      for (const tick of ticksOf(-extent, extent, extent / 2)) {
        svg.append(createSvgElement('line', { x1: x(tick), x2: x(tick), y1: top, y2: bottom, class: tick === 0 ? 'zero' : 'gridline' }));
        drawText(svg, x(tick), bottom + 14, signedInteger(tick), { anchor: 'middle' });
      }
      const title = titleFor(right - left, 'Change in overall strength over the weekend (points)', 'Change over the weekend (points)');
      drawText(svg, (left + right) / 2, bottom + 32, title, {
        anchor: 'middle',
        className: 'secondary',
      });
      items.forEach((item, row) => {
        const middle = top + row * rowHeight + rowHeight / 2;
        drawText(svg, left - 8, middle, narrow ? item.shortLabel : item.label, {
          anchor: 'end',
          baseline: 'middle',
          className: 'secondary',
        });
        svg.append(
          createSvgElement(
            'rect',
            {
              x: x(-item.band),
              y: middle - 12,
              width: x(item.band) - x(-item.band),
              height: 24,
              rx: 3,
              fill: 'var(--ink)',
              'fill-opacity': 0.08,
            },
            [createSvgElement('title', {}, `${item.label}: uncertainty before the weekend ±${item.band.toFixed(1)} points`)],
          ),
        );
        const [start, end] = [Math.min(0, item.change), Math.max(0, item.change)];
        svg.append(
          createSvgElement(
            'rect',
            { x: x(start), y: middle - 5, width: Math.max(1.5, x(end) - x(start)), height: 10, rx: 2, fill: item.color },
            [createSvgElement('title', {}, `${item.label}: ${signedOneDecimal(item.change)} points`)],
          ),
        );
        drawText(svg, x(item.change) + (item.change < 0 ? -6 : 6), middle, signedOneDecimal(item.change), {
          anchor: item.change < 0 ? 'end' : 'start',
          baseline: 'middle',
          className: 'primary',
        });
      });
    },
    () => 6 + items.length * rowHeight + 40,
  );
}

/** The median overall strength of the 20 highest-rated drivers of a weekend (all of them on a smaller grid). */
function leadingField(snap) {
  const highest = snap.drivers
    .map((row) => row.overall)
    .filter(Number.isFinite)
    .sort((a, b) => b - a)
    .slice(0, 20);
  const middle = Math.floor(highest.length / 2);
  return highest.length % 2 ? highest[middle] : (highest[middle - 1] + highest[middle]) / 2;
}

/** One career in both runs (`chronological` is the loaded filtered model, `historical` the historical run): the overall strength after
 * every weekend the driver raced from `fromYear` to `toYear`, above the leading field of that weekend in the same run. The general level of
 * raw ratings differs between the runs, so each is measured against its own field. */
export function drawTwoRuns(container, chronological, historical, { driverId = '30', fromYear = 1994, toYear = 2006 } = {}) {
  const runs = [chronological, historical].map((model) =>
    model.snaps
      .filter((snap) => snap.year >= fromYear && snap.year <= toYear)
      .map((snap) => [fractionalYear(snap.date), ofDriver(snap, driverId)?.overall - leadingField(snap)])
      .filter((point) => Number.isFinite(point[1])),
  );
  if (runs.some((points) => points.length < 2)) return null;
  const values = runs.flat().map((point) => point[1]);
  const floor = Math.floor(Math.min(...values) / 20) * 20;
  const ceiling = Math.ceil(Math.max(...values) / 20) * 20;
  const [first, last] = [runs[0][0][0], runs[0].at(-1)[0]];
  // The labels sit near the middle of the period, above the higher line and below the lower one, clear of each line over the label's span.
  const middle = first + 0.45 * (last - first);
  const span = (points) => points.filter((point) => Math.abs(point[0] - middle) <= 0.12 * (last - first)).map((point) => point[1]);
  const [chronologicalSpan, historicalSpan] = runs.map(span);
  const chronologicalAbove = Math.max(...chronologicalSpan) >= Math.max(...historicalSpan);
  const [chronologicalMiddle, historicalMiddle] = chronologicalAbove
    ? [Math.max(...chronologicalSpan), Math.min(...historicalSpan)]
    : [Math.min(...chronologicalSpan), Math.max(...historicalSpan)];
  mountChart(
    container,
    (svg, width, height) => {
      const step = width < 520 ? 4 : 2;
      const axes = drawLines(svg, width, height, {
        xDomain: [Math.floor(first), last + 0.2],
        yDomain: [floor, ceiling + 8],
        xTicks: ticksOf(Math.ceil(first / step) * step, Math.floor(last), step),
        yTicks: ticksOf(floor, ceiling, 20),
        yFormat: signedInteger,
        yTitle: titleFor(width, 'Overall strength above the leading field (points)', 'Above the leading field (points)'),
        marginLeft: 48,
        marginRight: 16,
        series: [
          { color: 'var(--ink-3)', width: 2, points: runs[0] },
          { color: 'var(--s2)', width: 2.5, points: runs[1] },
        ],
      });
      for (const [text, value, above] of [
        ['chronological run', chronologicalMiddle, chronologicalAbove],
        ['historical run', historicalMiddle, !chronologicalAbove],
      ])
        drawText(svg, axes.x(middle), axes.y(value) + (above ? -12 : 18), text, { anchor: 'middle', className: 'secondary' });
    },
    heightFor,
  );
  return historical.snaps.map((snap) => ofDriver(snap, driverId)).findLast(Boolean)?.name ?? null;
}

// The race forecasts of 2008 to 2025, grouped by the chance they gave the first driver of a pair: the average forecast and how often that
// driver finished ahead. Pooled over the four scored periods from research/unified-ratings/results.json (refined_all, overall), the study of
// the published model; [lower bound of the group, average forecast, share finishing ahead, pairs].
const RELIABILITY = [
  [0, 0.0881, 0.1142, 1007],
  [0.1, 0.1504, 0.1505, 8692],
  [0.2, 0.247, 0.2406, 5681],
  [0.3, 0.3496, 0.3541, 5099],
  [0.4, 0.4515, 0.4466, 5544],
  [0.5, 0.5517, 0.5484, 6707],
  [0.6, 0.6514, 0.634, 7893],
  [0.7, 0.7528, 0.7375, 9922],
  [0.8, 0.8564, 0.8465, 20282],
  [0.9, 0.9133, 0.8986, 4488],
];

/** A calibration diagram of the race forecasts: each dot is a group of forecasts, at their average chance and at how often it happened. */
export function drawReliability(container) {
  mountChart(
    container,
    (svg, width, height) =>
      drawScatter(svg, width, height, {
        xDomain: [0, 100],
        yDomain: [0, 104],
        xTicks: [0, 25, 50, 75, 100],
        yTicks: [0, 25, 50, 75, 100],
        xFormat: percent,
        yFormat: percent,
        xTitle: titleFor(width, 'Forecast chance that the first driver finishes ahead', 'Forecast chance'),
        yTitle: titleFor(width, 'How often the first driver finished ahead', 'How often it happened'),
        marginLeft: 48,
        guides: [[0, 0, 100, 100]],
        radius: 5,
        color: 'var(--s2)',
        points: RELIABILITY.map(([low, forecast, outcome, pairs]) => ({
          x: 100 * forecast,
          y: 100 * outcome,
          opacity: 1,
          tooltip: `Forecasts of ${formatInteger(100 * low)}–${formatInteger(100 * low + 10)}%: ${pairs.toLocaleString('en-GB')} pairs, average forecast ${(100 * forecast).toFixed(1)}%, first driver ahead ${(100 * outcome).toFixed(1)}%`,
        })),
      }),
    (width) => Math.max(260, Math.min(340, width * 0.62)),
  );
}
