import { prepareUnifiedForecast } from '../../packages/core/src/unified/forecast.js';

const WIN_SAMPLES = 20000; // draws of which drivers retire, for the chance of winning

/** A fixed sequence of numbers in [0, 1), so that the same forecast gives the same chances every time it is drawn. */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/**
 * The chance of each driver winning, from the chances of finishing ahead of each other driver. The model forecasts pairs only, so the race is taken as
 * the order that agrees best with them: each driver has a strength (the mean, over the field, of the log-odds of finishing ahead of each opponent
 * before retirements, which is exact when the pairs agree), the finishers are ordered as in a Plackett–Luce model of those strengths, and a driver
 * retires with the chance the forecast gives over the distance.
 * @param {number[][]} ahead  ahead[i][j]: the chance that driver i finishes ahead of driver j, if neither retires
 * @param {number[]} finishes the chance that each driver finishes the race
 */
export function winProbabilities(ahead, finishes) {
  const n = finishes.length;
  const logit = (p) => Math.log(Math.min(1 - 1e-9, Math.max(1e-9, p)) / (1 - Math.min(1 - 1e-9, Math.max(1e-9, p))));
  const strengths = ahead.map((row, i) => Math.exp(row.reduce((sum, p, j) => (i === j ? sum : sum + logit(p)), 0) / Math.max(1, n - 1)));
  const random = seededRandom(1994);
  const wins = new Array(n).fill(0);
  const finished = new Array(n);
  for (let draw = 0; draw < WIN_SAMPLES; draw++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      finished[i] = random() < finishes[i];
      if (finished[i]) total += strengths[i];
    }
    if (total > 0) for (let i = 0; i < n; i++) if (finished[i]) wins[i] += strengths[i] / total;
  }
  return wins.map((count) => count / WIN_SAMPLES);
}

// The expected position is one plus the expected number of opponents finishing ahead.
export function predictGrid(model, { date, laps, positions = [] } = {}) {
  const drivers = model.snaps.at(-1).drivers;
  const values = positions.map((value) => (value === '' || value == null ? null : Number(value)));
  const hasGrid = values.some((value) => value != null);
  if (
    hasGrid &&
    (values.length !== drivers.length || values.some((value) => !Number.isInteger(value) || value < 1 || value > drivers.length))
  )
    throw Error(`Enter a starting position from 1 to ${drivers.length} for every driver, or leave all positions blank.`);
  if (hasGrid && new Set(values).size !== drivers.length) throw Error('Starting positions must be unique.');
  const forecast = prepareUnifiedForecast(model, { date });
  const rows = drivers.map((driver) => ({ driver, expectedPosition: 1 }));
  const ahead = drivers.map(() => new Array(drivers.length).fill(0.5));
  const finishes = new Array(drivers.length).fill(1);
  for (let first = 0; first < drivers.length; first++) {
    for (let second = first + 1; second < drivers.length; second++) {
      const result = forecast(drivers[first].driverId, drivers[second].driverId, {
        L: laps,
        ...(hasGrid ? { gridA: values[first], gridB: values[second] } : {}),
      });
      if (!result) throw Error('A driver is missing from the forecast.');
      rows[first].expectedPosition += 1 - result.p;
      rows[second].expectedPosition += result.p;
      ahead[first][second] = result.competitive;
      ahead[second][first] = 1 - result.competitive;
      finishes[first] = (1 - result.qA) ** result.L;
      finishes[second] = (1 - result.qB) ** result.L;
    }
  }
  winProbabilities(ahead, finishes).forEach((chance, index) => (rows[index].winProbability = chance));
  return rows.sort((a, b) => a.expectedPosition - b.expectedPosition || a.driver.name.localeCompare(b.driver.name));
}
